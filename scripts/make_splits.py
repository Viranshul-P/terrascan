"""Make the train / val / test split once and save it to data/splits/.

Run from the repo root after download_eurosat.py: python scripts/make_splits.py
The split is made once and reused by every model, so this refuses to overwrite it.
"""

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import list_images, stratified_split  # noqa: E402


def main():
    cfg = yaml.safe_load(open("configs/data.yaml"))
    splits_dir = Path(cfg["splits_dir"])
    if splits_dir.exists() and any(splits_dir.glob("*.csv")):
        print(f"ERROR: {splits_dir} already has split files. Never re-split.")
        sys.exit(1)

    df = list_images(cfg["raw_dir"])
    print(f"Found {len(df)} images in {df['label'].nunique()} classes")

    train, val, test = stratified_split(df, cfg["train_frac"], cfg["val_frac"], cfg["seed"])
    splits_dir.mkdir(parents=True, exist_ok=True)
    for name, part in [("train", train), ("val", val), ("test", test)]:
        part.to_csv(splits_dir / f"{name}.csv", index=False)
        print(f"{name}: {len(part)} rows -> {splits_dir / f'{name}.csv'}")


if __name__ == "__main__":
    main()
