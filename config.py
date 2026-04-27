# config.py — Central configuration. Edit only this file.
# DO NOT put API keys here — use .env file instead.

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ROOT_DIR     = Path(__file__).resolve().parent

# ── Directories ───────────────────────────────────────────────
DATA_DIR     = ROOT_DIR / "data"
MODEL_DIR    = ROOT_DIR / "models"
FIGURES_DIR  = ROOT_DIR / "figures"

# ── File paths ────────────────────────────────────────────────
CSV_PATH     = DATA_DIR  / "mta_feature_engineered.csv"
TRAIN_PATH   = DATA_DIR  / "train.pkl"
VAL_PATH     = DATA_DIR  / "val.pkl"
TEST_PATH    = DATA_DIR  / "test.pkl"
NORM_PATH    = DATA_DIR  / "norm_stats.pkl"
STATION_PATH = DATA_DIR  / "station_data.pkl"   # station stats + coords
MODEL_PATH   = MODEL_DIR / "transformer.pt"
HISTORY_PATH = MODEL_DIR / "history.pkl"

for d in [DATA_DIR, MODEL_DIR, FIGURES_DIR]:
    os.makedirs(d, exist_ok=True)

# ── CSV facts ─────────────────────────────────────────────────
TIMESTAMP_COL    = "timestamp"
STATION_COL      = "STATION"
TARGET_COL       = "footfall"
TIMESTAMP_FORMAT = "%d-%m-%Y %H:%M"

# Data sampled every 4 hours: 0,4,8,12,16,20
VALID_HOURS = [0, 4, 8, 12, 16, 20]

# 18 tabular features (confirmed)
TABULAR_FEATURES = [
    "hour", "day_of_week", "month", "is_weekend",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    "lag_1", "lag_2", "lag_3", "lag_6", "lag_12", "lag_42",
    "rolling_mean_3", "rolling_mean_6", "rolling_mean_12",
    "rolling_std_6",
]
TABULAR_DIM = len(TABULAR_FEATURES)   # 18
SEQ_LEN     = 12                       # 12 steps × 4h = 48h history

# ── Split (chronological, no shuffle) ────────────────────────
TRAIN_RATIO = 0.70
VAL_RATIO   = 0.15

# ── Model — Global Transformer with station embedding ─────────
# Station is encoded as a learnable embedding (not raw string)
N_STATIONS   = 378       # confirmed from CSV
STATION_EMB  = 32        # learnable embedding dim for station identity

D_MODEL      = 128       # increased from 64 for better capacity
N_HEADS      = 4
N_LAYERS     = 3         # increased from 2
FFN_DIM      = 512       # increased from 256
DROPOUT      = 0.1

# ── Training ──────────────────────────────────────────────────
BATCH_SIZE   = 512        # larger batch for stability
EPOCHS       = 300        # more epochs
LR           = 3e-4       # slightly higher max LR for OneCycleLR
WEIGHT_DECAY = 1e-4
PATIENCE     = 20         # more patience
GRAD_CLIP    = 1.0        # slightly looser for richer model
SEED         = 42

# ── Agent ─────────────────────────────────────────────────────
CROWD_LOW_PCT    = 33     # percentile → sparse
CROWD_HIGH_PCT   = 66     # percentile → crowded
NEARBY_RADIUS_KM = 2.0    # increased radius for more alternatives
TIME_WINDOW_HRS  = 3

# ── API Keys (loaded from .env) ────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
