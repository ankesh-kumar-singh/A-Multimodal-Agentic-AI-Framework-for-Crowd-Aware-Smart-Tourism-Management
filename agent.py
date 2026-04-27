# agent.py — Rule-based agentic recommendation module.
# All 4 tools fully implemented with real coordinates and station stats.

import pickle
import math
import numpy as np
import torch

from config import (
    STATION_PATH, NORM_PATH, MODEL_PATH,
    TABULAR_FEATURES, SEQ_LEN,
    CROWD_LOW_PCT, CROWD_HIGH_PCT,
    NEARBY_RADIUS_KM, TIME_WINDOW_HRS,
    VALID_HOURS,
)
from model import GlobalTransformerPredictor

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a  = (math.sin(Δφ/2)**2
          + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_valid_hour(hour):
    """Snap requested hour to nearest valid 4-hour slot."""
    diffs = [(abs(hour - h), h) for h in VALID_HOURS]
    return min(diffs)[1]


class TourismAgent:
    """
    Global agentic module — works for ALL 378 stations.

    Tool 1: predict_footfall(station, hour, day_of_week, month, is_weekend)
    Tool 2: classify_crowd(footfall)
    Tool 3: find_alternatives(station, hour, ...)
    Tool 4: best_time_slot(station, ...)
    """

    def __init__(self):
        self._load_model()
        self._load_station_data()
        self._load_norm()
        self._build_crowd_thresholds()

    # ── Loaders ───────────────────────────────────────────────
    def _load_model(self):
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"No model at {MODEL_PATH}. Run train.py first."
            )
        self.model = GlobalTransformerPredictor().to(DEVICE)
        self.model.load_state_dict(
            torch.load(MODEL_PATH, map_location=DEVICE)
        )
        self.model.eval()
        print("Model loaded.")

    def _load_station_data(self):
        if not STATION_PATH.exists():
            raise FileNotFoundError(
                f"No station data at {STATION_PATH}. Run dataset.py first."
            )
        with open(STATION_PATH, "rb") as f:
            data = pickle.load(f)
        self.station_stats  = data["stats"]
        self.station2idx    = data["station2idx"]
        self.all_stations   = sorted(self.station_stats.keys())
        print(f"Station data loaded: {len(self.all_stations)} stations.")

    def _load_norm(self):
        with open(NORM_PATH, "rb") as f:
            self.mean, self.std = pickle.load(f)

    def _build_crowd_thresholds(self):
        """Compute percentile thresholds from station mean footfalls."""
        means = [v["mean_footfall"] for v in self.station_stats.values()]
        arr   = np.array(means)
        self.low_thresh  = float(np.percentile(arr, CROWD_LOW_PCT))
        self.high_thresh = float(np.percentile(arr, CROWD_HIGH_PCT))
        print(f"Crowd thresholds: sparse<{self.low_thresh:.0f} "
              f"crowded>{self.high_thresh:.0f}")

    # ── Build input tensor ────────────────────────────────────
    def _build_input(self, station: str, hour: int,
                     day_of_week: int = 2,
                     month: int = 1,
                     is_weekend: int = 0) -> tuple:
        """
        Builds (X, sidx) for model inference.
        Uses the station's last known feature vectors as history,
        then overrides with the user-requested time context.
        """
        snap_hour = nearest_valid_hour(hour)
        stats     = self.station_stats.get(station)

        if stats is None:
            raise ValueError(f"Unknown station: '{station}'")

        sidx = stats["idx"]

        # Use last known feature rows for this station
        # Pick the snap_hour features as the base
        feat = stats["last_features"].get(
            snap_hour,
            list(stats["last_features"].values())[0]
        ).copy()   # (18,)

        # Override time-context features with user input
        feat_idx = {name: i for i, name in enumerate(TABULAR_FEATURES)}

        # hour
        feat[feat_idx["hour"]]        = float(snap_hour)
        feat[feat_idx["day_of_week"]] = float(day_of_week)
        feat[feat_idx["month"]]       = float(month)
        feat[feat_idx["is_weekend"]]  = float(is_weekend)

        # cyclical encoding
        feat[feat_idx["hour_sin"]] = math.sin(2 * math.pi * snap_hour / 24)
        feat[feat_idx["hour_cos"]] = math.cos(2 * math.pi * snap_hour / 24)
        feat[feat_idx["dow_sin"]]  = math.sin(2 * math.pi * day_of_week / 7)
        feat[feat_idx["dow_cos"]]  = math.cos(2 * math.pi * day_of_week / 7)

        # Stack into SEQ_LEN rows (same features repeated = static context)
        X    = np.tile(feat, (SEQ_LEN, 1)).astype(np.float32)
        X_t  = torch.from_numpy(X).unsqueeze(0).to(DEVICE)   # (1,12,18)
        s_t  = torch.tensor([sidx], dtype=torch.long).to(DEVICE)

        return X_t, s_t, snap_hour

    # ── TOOL 1: Predict ───────────────────────────────────────
    def predict_footfall(self,
                         station    : str,
                         hour       : int,
                         day_of_week: int = 2,
                         month      : int = 1,
                         is_weekend : int = 0) -> dict:
        """
        Predicts footfall for a station at a given time.
        Returns dict with prediction and context.
        """
        X_t, s_t, snap_hour = self._build_input(
            station, hour, day_of_week, month, is_weekend
        )
        with torch.no_grad():
            pred_norm = self.model(X_t, s_t).item()

        pred = max(0.0, pred_norm * self.std + self.mean)
        pred = round(pred, 1)

        return {
            "station"          : station,
            "hour_requested"   : hour,
            "hour_used"        : snap_hour,
            "predicted_footfall": pred,
            "station_mean"     : round(self.station_stats[station]["mean_footfall"], 1),
        }

    # ── TOOL 2: Classify crowd ────────────────────────────────
    def classify_crowd(self, footfall: float) -> dict:
        """Classifies footfall into sparse / moderate / crowded."""
        if footfall < self.low_thresh:
            level, color, emoji = "sparse",   "green",  "🟢"
        elif footfall < self.high_thresh:
            level, color, emoji = "moderate", "orange", "🟡"
        else:
            level, color, emoji = "crowded",  "red",    "🔴"

        pct = min(100, int(footfall / max(1, self.high_thresh) * 100))

        return {
            "level"          : level,
            "color"          : color,
            "emoji"          : emoji,
            "footfall"       : footfall,
            "capacity_pct"   : pct,
            "low_threshold"  : round(self.low_thresh, 0),
            "high_threshold" : round(self.high_thresh, 0),
        }

    # ── TOOL 3: Find alternatives ─────────────────────────────
    def find_alternatives(self,
                          station    : str,
                          hour       : int,
                          day_of_week: int = 2,
                          month      : int = 1,
                          is_weekend : int = 0,
                          top_k      : int = 3) -> list:
        """
        Finds nearby stations with lower predicted footfall.
        Uses real haversine distance from station coordinates.
        """
        if station not in self.station_stats:
            return []

        target_pred = self.predict_footfall(
            station, hour, day_of_week, month, is_weekend
        )["predicted_footfall"]

        s_lat = self.station_stats[station]["lat"]
        s_lon = self.station_stats[station]["lon"]

        candidates = []
        for alt, alt_stats in self.station_stats.items():
            if alt == station:
                continue
            dist = haversine_km(s_lat, s_lon,
                                alt_stats["lat"], alt_stats["lon"])
            if dist <= NEARBY_RADIUS_KM:
                candidates.append((alt, dist))

        if not candidates:
            # Expand radius if no nearby found
            for alt, alt_stats in self.station_stats.items():
                if alt == station:
                    continue
                dist = haversine_km(s_lat, s_lon,
                                    alt_stats["lat"], alt_stats["lon"])
                candidates.append((alt, dist))
            candidates.sort(key=lambda x: x[1])
            candidates = candidates[:15]

        results = []
        for alt, dist in candidates:
            alt_pred = self.predict_footfall(
                alt, hour, day_of_week, month, is_weekend
            )["predicted_footfall"]
            crowd = self.classify_crowd(alt_pred)
            pct_diff = ((target_pred - alt_pred) / max(1, target_pred) * 100)
            results.append({
                "station"           : alt,
                "predicted_footfall": alt_pred,
                "crowd_level"       : crowd["level"],
                "crowd_color"       : crowd["color"],
                "crowd_emoji"       : crowd["emoji"],
                "distance_km"       : round(dist, 2),
                "pct_less_crowded"  : round(pct_diff, 1),
                "lat"               : self.station_stats[alt]["lat"],
                "lon"               : self.station_stats[alt]["lon"],
            })

        # Sort by footfall (least crowded first)
        results.sort(key=lambda x: x["predicted_footfall"])
        return results[:top_k]

    # ── TOOL 4: Best time slot ────────────────────────────────
    def best_time_slot(self,
                       station    : str,
                       target_hour: int,
                       day_of_week: int = 2,
                       month      : int = 1,
                       is_weekend : int = 0) -> dict:
        """
        Finds least crowded time slot within ±TIME_WINDOW_HRS.
        Only considers valid 4-hour slots.
        """
        lo = max(0,  target_hour - TIME_WINDOW_HRS)
        hi = min(23, target_hour + TIME_WINDOW_HRS)
        window_hours = [h for h in VALID_HOURS if lo <= h <= hi]

        if not window_hours:
            window_hours = VALID_HOURS

        predictions = {}
        for h in window_hours:
            pred = self.predict_footfall(
                station, h, day_of_week, month, is_weekend
            )["predicted_footfall"]
            predictions[h] = pred

        best_hour  = min(predictions, key=predictions.get)
        best_val   = predictions[best_hour]
        target_val = predictions.get(
            nearest_valid_hour(target_hour),
            list(predictions.values())[0]
        )
        pct_reduction = max(0.0, (target_val - best_val) / max(1, target_val) * 100)

        return {
            "best_hour"      : best_hour,
            "best_footfall"  : round(best_val, 1),
            "target_footfall": round(target_val, 1),
            "pct_reduction"  : round(pct_reduction, 1),
            "all_predictions": {h: round(v, 1) for h, v in predictions.items()},
            "window_searched": f"{lo}:00–{hi}:00",
        }

    # ── Full recommendation ───────────────────────────────────
    def recommend(self,
                  station    : str,
                  hour       : int,
                  day_of_week: int = 2,
                  month      : int = 1,
                  is_weekend : int = 0) -> dict:
        """Runs all 4 tools and returns structured recommendation."""
        pred_result   = self.predict_footfall(station, hour, day_of_week, month, is_weekend)
        crowd         = self.classify_crowd(pred_result["predicted_footfall"])
        alternatives  = self.find_alternatives(station, hour, day_of_week, month, is_weekend)
        best_time     = self.best_time_slot(station, hour, day_of_week, month, is_weekend)

        return {
            "station"       : station,
            "hour"          : hour,
            "hour_used"     : pred_result["hour_used"],
            "footfall"      : pred_result["predicted_footfall"],
            "crowd"         : crowd,
            "alternatives"  : alternatives,
            "best_time"     : best_time,
            "station_lat"   : self.station_stats[station]["lat"],
            "station_lon"   : self.station_stats[station]["lon"],
        }

    def station_info(self, station: str) -> dict:
        """Returns metadata for a station."""
        if station not in self.station_stats:
            return {}
        s = self.station_stats[station]
        return {
            "station"     : station,
            "lat"         : s["lat"],
            "lon"         : s["lon"],
            "mean_footfall": round(s["mean_footfall"], 1),
            "std_footfall" : round(s["std_footfall"], 1),
        }

    def list_stations(self):
        return self.all_stations


if __name__ == "__main__":
    print("Testing agent...")
    agent = TourismAgent()
    print(f"\nStations: {len(agent.list_stations())}")

    r = agent.recommend("42 ST-TIMES SQ", hour=18, day_of_week=4)
    print(f"\nStation  : {r['station']}")
    print(f"Footfall : {r['footfall']}")
    print(f"Crowd    : {r['crowd']['level']} {r['crowd']['emoji']}")
    print(f"Best time: {r['best_time']['best_hour']}:00 "
          f"(-{r['best_time']['pct_reduction']}%)")
    if r["alternatives"]:
        print(f"Alt 1    : {r['alternatives'][0]['station']} "
              f"({r['alternatives'][0]['distance_km']} km)")
