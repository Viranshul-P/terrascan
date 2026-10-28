"""Compute per-channel mean/std from the TRAIN split only and save to data/stats.json.

Run from the repo root after make_splits.py: python scripts/compute_stats.py
"""

import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import compute_stats  # noqa: E402


def main():
    cfg = yaml.safe_load(open("configs/data.yaml"))
    stats = compute_stats(Path(cfg["splits_dir"]) / "train.csv", cfg["raw_dir"])
    Path(cfg["stats_path"]).write_text(json.dumps(stats, indent=2) + "\n")
    print(f"mean: {stats['mean']}")
    print(f"std:  {stats['std']}")
    print(f"Saved to {cfg['stats_path']}")


if __name__ == "__main__":
    main()
