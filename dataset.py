# dataset.py
# Loads CSV, creates sequences WITH station index encoding,
# builds train/val/test splits and DataLoaders.

import os
import pickle
import math
import numpy as np
import pandas as pd
from pathlib import Path
from tqdm import tqdm

import torch
from torch.utils.data import Dataset, DataLoader

from config import (
    CSV_PATH, TRAIN_PATH, VAL_PATH, TEST_PATH,
    NORM_PATH, STATION_PATH,
    TIMESTAMP_COL, STATION_COL, TARGET_COL,
    TIMESTAMP_FORMAT, TABULAR_FEATURES,
    TABULAR_DIM, SEQ_LEN,
    TRAIN_RATIO, VAL_RATIO,
    BATCH_SIZE, SEED, VALID_HOURS,
)


# ── 1. Load & sort ────────────────────────────────────────────
def load_csv():
    df = pd.read_csv(CSV_PATH)
    df[TIMESTAMP_COL] = pd.to_datetime(
        df[TIMESTAMP_COL], format=TIMESTAMP_FORMAT, errors="coerce"
    )
    bad = df[TIMESTAMP_COL].isna().sum()
    if bad:
        print(f"  [WARN] Dropping {bad} unparseable timestamps")
        df = df.dropna(subset=[TIMESTAMP_COL])

    df = df.sort_values([STATION_COL, TIMESTAMP_COL]).reset_index(drop=True)

    # Remove rows with zero footfall (sensor error / closed)
    zero_mask = df[TARGET_COL] == 0
    if zero_mask.sum() > 0:
        print(f"  [INFO] Removing {zero_mask.sum()} zero-footfall rows")
        df = df[~zero_mask].reset_index(drop=True)

    print(f"Loaded : {len(df):,} rows | {df[STATION_COL].nunique()} stations")
    return df


# ── 2. Build station index map ────────────────────────────────
def build_station_index(df):
    """Maps each station name → integer index [0, N-1]."""
    stations = sorted(df[STATION_COL].unique())
    station2idx = {s: i for i, s in enumerate(stations)}
    idx2station = {i: s for s, i in station2idx.items()}
    return station2idx, idx2station


# ── 3. Build station stats (for agent) ────────────────────────
def build_station_stats(df, station2idx):
    """
    Per-station statistics saved for agent use:
      - mean/std footfall
      - hourly mean footfall (for default predictions)
      - last known feature vector per hour
    """
    from stations_coords import STATION_COORDINATES

    stats = {}
    for station, grp in df.groupby(STATION_COL):
        grp = grp.sort_values(TIMESTAMP_COL)
        hourly_mean = grp.groupby("hour")[TARGET_COL].mean().to_dict()
        # Last feature vector per hour (for inference without live data)
        last_features = {}
        for hour_val, hgrp in grp.groupby("hour"):
            last_row = hgrp.iloc[-1]
            last_features[int(hour_val)] = \
                last_row[TABULAR_FEATURES].values.astype(np.float32)

        stats[station] = {
            "idx"          : station2idx[station],
            "mean_footfall": float(grp[TARGET_COL].mean()),
            "std_footfall" : float(grp[TARGET_COL].std()),
            "hourly_mean"  : {int(k): float(v) for k, v in hourly_mean.items()},
            "last_features": last_features,
            "lat"          : STATION_COORDINATES.get(station, (40.7128, -74.0060))[0],
            "lon"          : STATION_COORDINATES.get(station, (40.7128, -74.0060))[1],
        }

    with open(STATION_PATH, "wb") as f:
        pickle.dump({
            "stats"       : stats,
            "station2idx" : station2idx,
        }, f)
    print(f"Station stats saved → {STATION_PATH}")
    return stats


# ── 4. Create sequences ────────────────────────────────────────
def create_sequences(df, station2idx, seq_len=SEQ_LEN):
    """
    Sliding window per station.
    Each sequence includes the station index as a separate field
    so the global model knows which station it's predicting for.

    Returns list of dicts:
      X       : (seq_len, TABULAR_DIM)  float32
      y       : scalar float
      station : str
      station_idx : int
      hour    : int  (hour of prediction target)
    """
    seqs = []
    for station, grp in tqdm(
        df.groupby(STATION_COL, sort=False),
        desc="Creating sequences",
        total=df[STATION_COL].nunique(),
    ):
        grp = grp.sort_values(TIMESTAMP_COL).reset_index(drop=True)
        if len(grp) < seq_len + 1:
            continue

        X_all   = grp[TABULAR_FEATURES].values.astype(np.float32)
        y_all   = grp[TARGET_COL].values.astype(np.float32)
        hr_all  = grp["hour"].values.astype(np.int32)
        sidx    = station2idx[station]

        for i in range(len(grp) - seq_len):
            seqs.append({
                "X"           : X_all[i : i + seq_len],
                "y"           : float(y_all[i + seq_len]),
                "station"     : station,
                "station_idx" : sidx,
                "hour"        : int(hr_all[i + seq_len]),
            })

    print(f"Created: {len(seqs):,} sequences (seq_len={seq_len})")
    return seqs


# ── 5. Chronological split ────────────────────────────────────
def split(seqs, train_ratio=TRAIN_RATIO, val_ratio=VAL_RATIO):
    n  = len(seqs)
    n1 = int(n * train_ratio)
    n2 = int(n * val_ratio)
    tr = seqs[:n1]
    va = seqs[n1 : n1 + n2]
    te = seqs[n1 + n2:]
    print(f"Split  : train={len(tr):,} val={len(va):,} test={len(te):,}")
    return tr, va, te


# ── 6. Normalisation (train only) ─────────────────────────────
def compute_norm(train_seqs):
    y    = np.array([s["y"] for s in train_seqs], dtype=np.float32)
    mean = float(y.mean())
    std  = float(y.std())
    print(f"Norm   : mean={mean:.2f}  std={std:.2f}  "
          f"min={y.min():.0f}  max={y.max():.0f}")
    return mean, std


# ── 7. PyTorch Dataset ────────────────────────────────────────
class MTADataset(Dataset):
    def __init__(self, seqs, mean=0.0, std=1.0):
        self.seqs = seqs
        self.mean = mean
        self.std  = std if std > 0 else 1.0

    def __len__(self):
        return len(self.seqs)

    def __getitem__(self, idx):
        s = self.seqs[idx]
        X     = torch.from_numpy(s["X"])                          # (12, 18)
        sidx  = torch.tensor(s["station_idx"], dtype=torch.long)  # scalar
        y_n   = (s["y"] - self.mean) / self.std
        target = torch.tensor(y_n, dtype=torch.float32)
        return X, sidx, target


def collate_fn(batch):
    X     = torch.stack([b[0] for b in batch])   # (B, 12, 18)
    sidx  = torch.stack([b[1] for b in batch])   # (B,)
    y     = torch.stack([b[2] for b in batch])   # (B,)
    return X, sidx, y


def build_loaders(tr, va, te, mean, std,
                  batch_size=BATCH_SIZE, seed=SEED):
    g = torch.Generator().manual_seed(seed)
    tl = DataLoader(MTADataset(tr, mean, std), batch_size=batch_size,
                    shuffle=True,  collate_fn=collate_fn,
                    num_workers=0, generator=g)
    vl = DataLoader(MTADataset(va, mean, std), batch_size=batch_size,
                    shuffle=False, collate_fn=collate_fn, num_workers=0)
    tel = DataLoader(MTADataset(te, mean, std), batch_size=batch_size,
                     shuffle=False, collate_fn=collate_fn, num_workers=0)
    print(f"Loaders: train={len(tl)} val={len(vl)} test={len(tel)} batches")
    return tl, vl, tel


# ── 8. Save / Load ────────────────────────────────────────────
def save_splits(tr, va, te, mean, std):
    for data, path in [(tr, TRAIN_PATH), (va, VAL_PATH), (te, TEST_PATH)]:
        with open(path, "wb") as f:
            pickle.dump(data, f)
        mb = os.path.getsize(path) / 1e6
        print(f"  {Path(path).name}: {len(data):,} seqs ({mb:.1f} MB)")
    with open(NORM_PATH, "wb") as f:
        pickle.dump((mean, std), f)
    print(f"  norm_stats.pkl: mean={mean:.2f} std={std:.2f}")


def load_splits():
    with open(TRAIN_PATH, "rb") as f: tr = pickle.load(f)
    with open(VAL_PATH,   "rb") as f: va = pickle.load(f)
    with open(TEST_PATH,  "rb") as f: te = pickle.load(f)
    with open(NORM_PATH,  "rb") as f: mean, std = pickle.load(f)
    return tr, va, te, mean, std


# ── Run directly ──────────────────────────────────────────────
if __name__ == "__main__":
    print("="*55)
    print("DATASET PREPARATION")
    print("="*55)

    df = load_csv()
    station2idx, idx2station = build_station_index(df)
    print(f"Stations: {len(station2idx)}")

    stats = build_station_stats(df, station2idx)
    seqs  = create_sequences(df, station2idx)
    tr, va, te = split(seqs)
    mean, std  = compute_norm(tr)

    print("\nSaving splits...")
    save_splits(tr, va, te, mean, std)

    print("\n✓ dataset.py complete")
    print("  Next: python model.py  (smoke test)")
    print("  Then: python train.py")
