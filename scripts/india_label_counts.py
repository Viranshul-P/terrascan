"""Step 4.2: count the reviewed Indian labels and save them to results/.

Run from the repo root: python scripts/india_label_counts.py --config configs/india.yaml
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.labeller import label_counts  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    counts = label_counts(pd.read_csv(cfg["reviewed_csv"]))
    out = Path(cfg["label_counts_path"])
    out.write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
