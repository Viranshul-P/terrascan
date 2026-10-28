"""Checks on the saved EuroSAT splits in data/splits/ (plus one test on fake data)."""

from pathlib import Path

import pandas as pd
import pytest

from src.data import stratified_split

SPLITS_DIR = Path(__file__).resolve().parents[1] / "data" / "splits"


@pytest.fixture(scope="module")
def splits():
    return {name: pd.read_csv(SPLITS_DIR / f"{name}.csv") for name in ["train", "val", "test"]}


def test_no_file_in_two_splits(splits):
    train, val, test = (set(splits[n]["path"]) for n in ["train", "val", "test"])
    assert not train & val
    assert not train & test
    assert not val & test


def test_counts_add_up_to_27000(splits):
    assert sum(len(df) for df in splits.values()) == 27000


def test_class_proportions_match(splits):
    all_rows = pd.concat(splits.values())
    overall = all_rows["label"].value_counts(normalize=True)
    assert len(overall) == 10
    for name, df in splits.items():
        share = df["label"].value_counts(normalize=True)
        for label in overall.index:
            assert abs(share[label] - overall[label]) < 0.01, f"{label} off in {name}"


def test_stratified_split_on_fake_data():
    fake = pd.DataFrame({"path": [f"img{i}.jpg" for i in range(200)], "label": ["a", "b"] * 100})
    train, val, test = stratified_split(fake, 0.70, 0.15, seed=42)
    assert (len(train), len(val), len(test)) == (140, 30, 30)
    assert (train["label"] == "a").sum() == 70
    # Same seed gives the same split
    train2, _, _ = stratified_split(fake, 0.70, 0.15, seed=42)
    assert train["path"].tolist() == train2["path"].tolist()
