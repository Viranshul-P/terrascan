"""Data helpers: list EuroSAT images and split them into train / val / test."""

from pathlib import Path

import numpy as np
import pandas as pd


def list_images(raw_dir):
    """Return a DataFrame with one row per image: path (relative to raw_dir) and label.

    EuroSAT RGB is laid out as EuroSAT_RGB/<ClassName>/<ClassName>_<n>.jpg,
    so the label is the name of the folder the image sits in.
    """
    raw_dir = Path(raw_dir)
    rows = []
    for jpg in sorted(raw_dir.glob("EuroSAT_RGB/*/*.jpg")):
        rows.append({"path": jpg.relative_to(raw_dir).as_posix(), "label": jpg.parent.name})
    return pd.DataFrame(rows, columns=["path", "label"])


def stratified_split(df, train_frac, val_frac, seed):
    """Split df into (train, val, test) so every class keeps the same proportions.

    For each class: shuffle its rows with a seeded RNG, then cut the first
    train_frac for train, the next val_frac for val, and the rest for test.
    """
    rng = np.random.default_rng(seed)
    train_parts, val_parts, test_parts = [], [], []
    for label in sorted(df["label"].unique()):
        rows = df[df["label"] == label]
        rows = rows.iloc[rng.permutation(len(rows))]
        n_train = round(len(rows) * train_frac)
        n_val = round(len(rows) * val_frac)
        train_parts.append(rows.iloc[:n_train])
        val_parts.append(rows.iloc[n_train : n_train + n_val])
        test_parts.append(rows.iloc[n_train + n_val :])
    return (
        pd.concat(train_parts, ignore_index=True),
        pd.concat(val_parts, ignore_index=True),
        pd.concat(test_parts, ignore_index=True),
    )
