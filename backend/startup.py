# backend/startup.py
# Downloads model + data files from Google Drive on Render startup.
# Only runs if files are missing — skips if already present.

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Paste your Google Drive file IDs here ─────────────────────
FILE_IDS = {
    "models/transformer.pt"    : "19iU1YVTqs8kiW5v7E9_Q3c-ANV2wlr-g",
    "data/train.pkl"           : "1__BZwuAiy2ZC3kO8B4jgTyn_i40zAPcD",
    "data/val.pkl"             : "1HzIvabmtaFXSRxuhzLfzmIQwLG11_4h3",
    "data/test.pkl"            : "1JNdwzesiwBfMyM6GiVyCxg63zqPAfCqV",
    "data/norm_stats.pkl"      : "1F9AI8awzrdfLiPvQxKHanWewdy4r-XvJ",
    "data/station_data.pkl"    : "1_z8tkkx7muKJAJR6aISe8as28rWXtbOr",
}


def download_if_missing():
    try:
        import gdown
    except ImportError:
        print("Installing gdown...")
        os.system(f"{sys.executable} -m pip install gdown")
        import gdown

    all_present = all((ROOT / path).exists() for path in FILE_IDS)
    if all_present:
        print("All model files present. Skipping download.")
        return

    print("Downloading model files from Google Drive...")
    for rel_path, file_id in FILE_IDS.items():
        dest = ROOT / rel_path
        os.makedirs(dest.parent, exist_ok=True)
        if dest.exists():
            print(f"  Skipping (exists): {rel_path}")
            continue
        print(f"  Downloading: {rel_path}")
        url = f"https://drive.google.com/uc?id={file_id}"
        gdown.download(url, str(dest), quiet=False)

    print("All files downloaded.")


if __name__ == "__main__":
    download_if_missing()