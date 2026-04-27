# train.py
# Training loop for GlobalTransformerPredictor.
# Key fixes vs previous version:
#   - Station embedding in model (global model)
#   - OneCycleLR with 10% warmup (prevents explosion)
#   - Pre-LN Transformer (stable from epoch 1)
#   - Larger model + more epochs
#   - Log-transform target (handles skewed footfall distribution)
#   - Huber loss (robust to outliers)
#   - Better MAPE: computed only where footfall > 50

import sys, time, pickle, random
import numpy as np
import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import OneCycleLR

from config import (
    TRAIN_PATH, VAL_PATH, NORM_PATH,
    MODEL_PATH, HISTORY_PATH,
    BATCH_SIZE, EPOCHS, LR, WEIGHT_DECAY,
    PATIENCE, SEED, GRAD_CLIP,
)
from dataset import load_splits, build_loaders
from model   import GlobalTransformerPredictor

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def set_seed(s=SEED):
    random.seed(s); np.random.seed(s); torch.manual_seed(s)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(s)


def calc_metrics(pred_real, true_real):
    """Metrics on de-normalised real-scale predictions."""
    pred_real = pred_real.clamp(min=0)   # footfall can't be negative
    rmse = torch.sqrt(nn.functional.mse_loss(pred_real, true_real)).item()
    mae  = nn.functional.l1_loss(pred_real, true_real).item()
    mask = true_real > 50   # avoid div-by-zero on near-zero rows
    if mask.sum() > 0:
        mape = ((torch.abs(pred_real[mask] - true_real[mask])
                 / true_real[mask]).mean().item() * 100.0)
    else:
        mape = float("nan")
    return rmse, mae, mape


def run_epoch(model, loader, opt, sched,
              crit, is_train, mean, std):
    model.train() if is_train else model.eval()
    total_loss = 0.0
    all_pred, all_true = [], []

    ctx = torch.enable_grad() if is_train else torch.no_grad()
    with ctx:
        for X, sidx, y in loader:
            X    = X.to(DEVICE)
            sidx = sidx.to(DEVICE)
            y    = y.to(DEVICE)

            pred_norm = model(X, sidx)
            loss      = crit(pred_norm, y)

            if is_train:
                opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
                opt.step()
                sched.step()

            total_loss += loss.item() * len(y)

            # de-normalise
            pred_real = (pred_norm.detach() * std + mean).cpu()
            true_real = (y.detach()          * std + mean).cpu()
            all_pred.append(pred_real)
            all_true.append(true_real)

    pred = torch.cat(all_pred)
    true = torch.cat(all_true)
    rmse, mae, mape = calc_metrics(pred, true)

    return {
        "loss": total_loss / len(true),
        "rmse": rmse, "mae": mae, "mape": mape,
    }


def train():
    set_seed()

    # ── Check prerequisites ───────────────────────────────────
    for p in [TRAIN_PATH, VAL_PATH, NORM_PATH]:
        if not p.exists():
            print(f"ERROR: {p.name} not found. Run dataset.py first.")
            sys.exit(1)

    # ── Load data ─────────────────────────────────────────────
    print("Loading data...")
    tr, va, _, mean, std = load_splits()
    tl, vl, _ = build_loaders(tr, va, [], mean, std, BATCH_SIZE)

    print(f"\nDevice : {DEVICE}")
    print(f"Train  : {len(tr):,} seqs | Val: {len(va):,} seqs")
    print(f"Norm   : mean={mean:.2f}  std={std:.2f}")

    # ── Model ─────────────────────────────────────────────────
    model   = GlobalTransformerPredictor().to(DEVICE)
    n_param = sum(p.numel() for p in model.parameters())
    print(f"Params : {n_param:,}")

    # Huber loss: robust to the large outliers in footfall distribution
    crit = nn.HuberLoss(delta=1.0)

    # AdamW with proper Transformer betas
    opt = AdamW(
        model.parameters(),
        lr=LR,
        weight_decay=WEIGHT_DECAY,
        betas=(0.9, 0.98),
        eps=1e-9,
    )

    # OneCycleLR: 10% warmup then cosine decay
    # This is the key fix for the explosion problem
    sched = OneCycleLR(
        opt,
        max_lr          = LR,
        steps_per_epoch = len(tl),
        epochs          = EPOCHS,
        pct_start       = 0.10,        # 10% warmup
        anneal_strategy = "cos",
        div_factor      = 25.0,        # start LR = max_lr/25
        final_div_factor= 1e4,         # end LR = max_lr/10000
    )

    # ── Training loop ─────────────────────────────────────────
    best_rmse, best_ep, wait = float("inf"), 0, 0
    hist = {k: [] for k in
            ["train_loss","train_rmse","train_mae","train_mape",
             "val_loss","val_rmse","val_mae","val_mape"]}

    print(f"\n{'Ep':>4}  {'TrLoss':>8}  {'TrRMSE':>8}  "
          f"{'VaRMSE':>8}  {'VaMAE':>8}  {'VaMAPE':>8}  {'LR':>9}")
    print("─" * 65)

    t0 = time.time()

    for ep in range(1, EPOCHS + 1):
        tr_m = run_epoch(model, tl, opt, sched, crit, True,  mean, std)
        va_m = run_epoch(model, vl, opt, sched, crit, False, mean, std)

        for k in ["loss","rmse","mae","mape"]:
            hist[f"train_{k}"].append(tr_m[k])
            hist[f"val_{k}"].append(va_m[k])

        improved = va_m["rmse"] < best_rmse
        if improved:
            best_rmse, best_ep, wait = va_m["rmse"], ep, 0
            torch.save(model.state_dict(), MODEL_PATH)
            mark = "✓"
        else:
            wait += 1
            mark = " "

        cur_lr = opt.param_groups[0]["lr"]
        print(
            f"{mark}{ep:>4}  "
            f"{tr_m['loss']:>8.4f}  {tr_m['rmse']:>8.1f}  "
            f"{va_m['rmse']:>8.1f}  {va_m['mae']:>8.1f}  "
            f"{va_m['mape']:>7.1f}%  {cur_lr:>9.2e}"
        )

        # Early stopping
        if wait >= PATIENCE:
            print(f"\nEarly stop at ep {ep}  "
                  f"(best val RMSE={best_rmse:.2f} @ ep {best_ep})")
            break

    hist["best_val_rmse"] = best_rmse
    hist["best_epoch"]    = best_ep

    with open(HISTORY_PATH, "wb") as f:
        pickle.dump(hist, f)

    elapsed = time.time() - t0
    print(f"\n{'='*55}")
    print(f"Done in {elapsed:.0f}s  ({elapsed/60:.1f} min)")
    print(f"Best val RMSE : {best_rmse:.2f}  (epoch {best_ep})")
    print(f"Model saved   : {MODEL_PATH}")
    print(f"\nNext step: python evaluate.py")


if __name__ == "__main__":
    train()
