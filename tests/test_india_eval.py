import pandas as pd
import pytest
import torch

from src.india_eval import (
    accuracy,
    bootstrap_range,
    load_labels,
    present_macro_f1,
    score,
    split_by_area,
)


def test_present_macro_f1_ignores_absent_classes():
    labels = torch.tensor([0, 0, 1, 1])
    preds = torch.tensor([0, 0, 1, 1])
    # perfect on the 2 classes that exist; the 8 absent classes don't drag it down
    assert present_macro_f1(preds, labels) == 1.0


def test_present_macro_f1_wrong_absent_prediction_still_hurts():
    labels = torch.tensor([0, 0, 1, 1])
    preds = torch.tensor([0, 0, 1, 9])  # 9 never appears in labels
    # class 0: F1 1.0; class 1: tp 1, fn 1 -> 2/3
    assert present_macro_f1(preds, labels) == pytest.approx((1.0 + 2 / 3) / 2)


def test_bootstrap_range_contains_score_and_is_repeatable():
    labels = torch.tensor([0, 1] * 50)
    preds = labels.clone()
    preds[:30] = 5  # 70% right
    r1 = bootstrap_range(preds, labels, accuracy, 500, seed=42)
    r2 = bootstrap_range(preds, labels, accuracy, 500, seed=42)
    assert r1 == r2
    assert r1[0] < 0.7 < r1[1]


def test_bootstrap_range_all_correct_is_exact():
    labels = torch.tensor([0, 1, 2, 3])
    assert bootstrap_range(labels, labels, accuracy, 100, seed=1) == [1.0, 1.0]


def test_split_by_area_keeps_areas_apart():
    df = pd.DataFrame({"area": ["a", "a", "b", "c"], "final_label": ["Forest"] * 4})
    finetune, test = split_by_area(df, ["c"], ["a", "b"])
    assert len(finetune) == 3 and len(test) == 1
    assert set(finetune["area"]).isdisjoint(test["area"])


def test_split_by_area_rejects_overlap_and_unassigned():
    df = pd.DataFrame({"area": ["a", "b"], "final_label": ["Forest"] * 2})
    with pytest.raises(AssertionError):
        split_by_area(df, ["a"], ["a", "b"])
    with pytest.raises(AssertionError):
        split_by_area(df, ["a"], [])


def test_load_labels_drops_skips(tmp_path):
    csv = tmp_path / "reviewed.csv"
    pd.DataFrame(
        {"file": ["a.png", "b.png", "c.png"], "final_label": ["Forest", "skip", "River"]}
    ).to_csv(csv, index=False)
    df = load_labels(csv)
    assert list(df["file"]) == ["a.png", "c.png"]


def test_score_absent_class_f1_is_none():
    labels = torch.tensor([0, 0, 1, 1])
    preds = torch.tensor([0, 0, 1, 9])
    cfg = {"bootstrap_samples": 50, "bootstrap_seed": 42}
    result = score(preds, labels, cfg)
    assert result["per_class"]["SeaLake"] == {"true_count": 0, "predicted_count": 1, "f1": None}
    assert result["per_class"]["AnnualCrop"]["f1"] == 1.0
    assert result["n_patches"] == 4 and result["accuracy"] == 0.75
