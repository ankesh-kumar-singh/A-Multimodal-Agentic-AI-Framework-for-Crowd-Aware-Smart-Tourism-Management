# evaluate.py — Test set evaluation + all paper figures.

import sys, pickle
import numpy as np
import torch, torch.nn as nn
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path
from torch.utils.data import DataLoader

from config import (TEST_PATH, NORM_PATH, MODEL_PATH, HISTORY_PATH,
                    FIGURES_DIR, TABULAR_FEATURES, BATCH_SIZE)
from dataset import load_splits, MTADataset, collate_fn
from model   import GlobalTransformerPredictor

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SAVE   = Path(FIGURES_DIR)


def load_model():
    if not MODEL_PATH.exists():
        print("ERROR: no model. Run train.py first."); sys.exit(1)
    m = GlobalTransformerPredictor().to(DEVICE)
    m.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    m.eval(); return m


def get_preds(model, seqs, mean, std):
    dl = DataLoader(MTADataset(seqs, mean, std),
                    batch_size=BATCH_SIZE, shuffle=False,
                    collate_fn=collate_fn)
    ps, ts = [], []
    with torch.no_grad():
        for X, sidx, y in dl:
            p = model(X.to(DEVICE), sidx.to(DEVICE))
            ps.append((p.clamp(min=0)*std+mean).cpu())
            ts.append((y*std+mean).cpu())
    return torch.cat(ps), torch.cat(ts)


def calc(pred, true):
    rmse = torch.sqrt(nn.functional.mse_loss(pred, true)).item()
    mae  = nn.functional.l1_loss(pred, true).item()
    mask = true > 50
    mape = ((torch.abs(pred[mask]-true[mask])/true[mask]).mean().item()*100
            if mask.sum()>0 else float("nan"))
    return rmse, mae, mape


def fig_loss(hist):
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    fig.patch.set_facecolor("white")
    fig.suptitle("Training Metrics per Epoch",
                 fontsize=13, fontweight="bold", color="black")
    ep = range(1, len(hist["train_rmse"])+1)
    for ax, key, label in [(axes[0],"rmse","RMSE"), (axes[1],"mape","MAPE %")]:
        ax.set_facecolor("white")
        ax.plot(ep, hist[f"train_{key}"], "#2166AC", lw=1.8, label=f"Train {label}")
        ax.plot(ep, hist[f"val_{key}"],   "#D6604D", lw=1.8, ls="--", label=f"Val {label}")
        ax.axvline(hist["best_epoch"], color="#555", lw=0.8, ls=":")
        ax.text(hist["best_epoch"]+0.3, max(hist[f"val_{key}"])*0.95,
                f"ep {hist['best_epoch']}", fontsize=8, color="#555")
        ax.set_xlabel("Epoch", color="black", fontsize=10)
        ax.set_ylabel(label, color="black", fontsize=10)
        ax.set_title(label, fontweight="bold", color="black")
        ax.spines[["top","right"]].set_visible(False)
        ax.tick_params(colors="black")
        ax.yaxis.grid(True, color="#eee", lw=0.7)
        ax.set_axisbelow(True)
        leg = ax.legend(edgecolor="black", framealpha=0.9, fontsize=9)
        [t.set_color("black") for t in leg.get_texts()]
    plt.tight_layout()
    plt.savefig(SAVE/"fig_loss.png", dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(); print("  fig_loss.png")


def fig_pred(pred, true, n=500):
    p, t = pred[:n].numpy(), true[:n].numpy()
    fig, (a1,a2) = plt.subplots(1,2,figsize=(13,5))
    fig.patch.set_facecolor("white")
    fig.suptitle("Predicted vs Actual Footfall — Global Transformer",
                 fontsize=13, fontweight="bold", color="black")
    a1.set_facecolor("white")
    a1.plot(t, "#2166AC", lw=1.1, label="Actual", alpha=0.9)
    a1.plot(p, "#D6604D", lw=1.1, ls="--", label="Predicted", alpha=0.8)
    a1.set_xlabel("Sample index", color="black"); a1.set_ylabel("Footfall", color="black")
    a1.set_title(f"Time series (first {n})", fontweight="bold", color="black")
    a1.spines[["top","right"]].set_visible(False)
    a1.tick_params(colors="black"); a1.yaxis.grid(True, color="#eee", lw=0.7)
    leg = a1.legend(edgecolor="black", framealpha=0.9, fontsize=9)
    [tx.set_color("black") for tx in leg.get_texts()]
    lim = max(t.max(), p.max())*1.05
    a2.set_facecolor("white")
    a2.scatter(t, p, alpha=0.2, s=5, color="#2166AC")
    a2.plot([0,lim],[0,lim], "#D6604D", lw=1.5, ls="--", label="Perfect")
    a2.set_xlim(0,lim); a2.set_ylim(0,lim)
    a2.set_xlabel("Actual", color="black"); a2.set_ylabel("Predicted", color="black")
    a2.set_title("Scatter", fontweight="bold", color="black")
    a2.spines[["top","right"]].set_visible(False)
    a2.tick_params(colors="black")
    leg2 = a2.legend(edgecolor="black", framealpha=0.9, fontsize=9)
    [tx.set_color("black") for tx in leg2.get_texts()]
    plt.tight_layout()
    plt.savefig(SAVE/"fig_pred_vs_actual.png", dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(); print("  fig_pred_vs_actual.png")


def fig_attention(model, test_seqs, mean, std, n=8):
    seqs = test_seqs[:n]
    X    = torch.stack([torch.from_numpy(s["X"]) for s in seqs]).to(DEVICE)
    sidx = torch.tensor([s["station_idx"] for s in seqs], dtype=torch.long).to(DEVICE)
    with torch.no_grad():
        attn = model.get_attention_weights(X, sidx).cpu().numpy()
    t_labels = [f"t−{11-i}" if i<11 else "t" for i in range(12)]
    y_labels = [f"{seqs[i]['station'][:16]}" for i in range(n)]
    fig, ax = plt.subplots(figsize=(13,5))
    fig.patch.set_facecolor("white")
    im = ax.imshow(attn, cmap="YlOrRd", aspect="auto", vmin=0, vmax=attn.max())
    for i in range(n):
        for j in range(12):
            v = attn[i,j]
            c = "white" if v > 0.5*attn.max() else "black"
            ax.text(j, i, f"{v:.2f}", ha="center", va="center",
                    fontsize=7.5, color=c, fontweight="bold")
    ax.set_xticks(range(12)); ax.set_xticklabels(t_labels, fontsize=9, color="black")
    ax.set_yticks(range(n));  ax.set_yticklabels(y_labels, fontsize=8, color="black")
    ax.set_xlabel("Input timestep (12-step window)", fontsize=10, color="black")
    ax.set_title("Transformer Attention Weights — Final Encoder Layer",
                 fontsize=11, fontweight="bold", color="black", pad=8)
    cb = plt.colorbar(im, ax=ax, fraction=0.025, pad=0.02)
    cb.set_label("Attention weight", fontsize=9, color="black")
    cb.ax.tick_params(labelsize=8, colors="black")
    plt.tight_layout()
    plt.savefig(SAVE/"fig_attention.png", dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(); print("  fig_attention.png")


if __name__ == "__main__":
    print("="*50); print("EVALUATION"); print("="*50)
    _, _, te, mean, std = load_splits()
    model = load_model()
    print("Running predictions...")
    pred, true = get_preds(model, te, mean, std)
    rmse, mae, mape = calc(pred, true)
    print(f"\n{'─'*40}")
    print(f"  RMSE : {rmse:.2f}")
    print(f"  MAE  : {mae:.2f}")
    print(f"  MAPE : {mape:.2f}%")
    print(f"{'─'*40}")
    hist = pickle.load(open(HISTORY_PATH,"rb")) if HISTORY_PATH.exists() else None
    print("\nGenerating figures...")
    if hist: fig_loss(hist)
    fig_pred(pred, true)
    fig_attention(model, te, mean, std)
    print(f"\n✓ Figures saved to figures/")
