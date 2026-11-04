import numpy as np
import pandas as pd
import pytest

from src.change_check import (
    check_same_pairs,
    crop_with_outline,
    read_reviewed,
    real_change_rate,
    sample_changed,
    save_review,
    scale_up,
    side_by_side,
    wilson_interval,
)


def fake_patches():
    return pd.DataFrame({
        "row": [0, 0, 64, 64, 128],
        "col": [0, 64, 0, 64, 0],
        "lon": [72.4] * 5,
        "lat": [23.1] * 5,
        "pred_2018_seed42": ["Pasture", "Forest", "AnnualCrop", "River", "Industrial"],
        "pred_2026_seed42": ["Residential", "Forest", "Industrial", "River", "Residential"],
    })


def test_sample_only_changed_patches_and_hides_classes():
    sample = sample_changed(fake_patches(), "pred_2018_seed42", "pred_2026_seed42", 3, seed=42)
    assert sorted(zip(sample["row"], sample["col"])) == [(0, 0), (64, 0), (128, 0)]
    assert list(sample.columns) == ["pair", "row", "col", "lon", "lat"]
    assert list(sample["pair"]) == ["pair_00", "pair_01", "pair_02"]


def test_sample_is_repeatable():
    a = sample_changed(fake_patches(), "pred_2018_seed42", "pred_2026_seed42", 2, seed=42)
    b = sample_changed(fake_patches(), "pred_2018_seed42", "pred_2026_seed42", 2, seed=42)
    assert a.equals(b)


def test_crop_size_outline_and_edge():
    rgb = np.zeros((200, 200, 3), dtype=np.uint8)
    middle = crop_with_outline(rgb, 64, 64, 64, 32, 2)
    assert middle.size == (128 * 2, 128 * 2)
    assert middle.getpixel((32 * 2, 32 * 2)) == (255, 255, 0)  # outline corner
    corner = crop_with_outline(rgb, 0, 0, 64, 32, 2)  # no room above / left
    assert corner.size == (96 * 2, 96 * 2)
    pair = side_by_side(middle, corner, gap=10)
    assert pair.size == (256 + 10 + 192, 256)


def test_review_saves_once_and_marks_changes(tmp_path):
    path = tmp_path / "reviewed.csv"
    save_review(path, "pair_00", "yes", "yes")
    save_review(path, "pair_01", "yes", "no")
    save_review(path, "pair_01", "yes", "yes")  # already reviewed: ignored
    reviewed = read_reviewed(path)
    assert list(reviewed["pair"]) == ["pair_00", "pair_01"]
    assert list(reviewed["changed"]) == [False, True]
    with pytest.raises(ValueError):
        save_review(path, "pair_02", "yes", "maybe")


def test_rate_ignores_unclear():
    result = real_change_rate(pd.Series(["yes", "no", "no", "no", "unclear"]))
    assert result["counts"] == {"yes": 1, "no": 3, "unclear": 1}
    assert result["real_rate"] == 0.25


def test_wilson_interval():
    assert wilson_interval(0, 0) is None
    low, high = wilson_interval(0, 10)
    assert low == pytest.approx(0, abs=1e-9) and 0 < high < 0.35
    low, high = wilson_interval(5, 10)  # symmetric around 0.5
    assert low == pytest.approx(1 - high)


def test_scale_up_uses_rate_and_range():
    seed_result = {"changed_patches": 10, "changed_km2": 100.0}
    rate = {"real_rate": 0.5, "real_rate_95": [0.25, 0.75]}
    out = scale_up(seed_result, rate)
    assert out["estimated_real_changed_km2"] == 50.0
    assert out["estimated_real_changed_km2_95"] == [25.0, 75.0]
    assert out["reported_changed_km2"] == 100.0
    no_clear = scale_up(seed_result, {"real_rate": None, "real_rate_95": None})
    assert "estimated_real_changed_km2" not in no_clear


def test_pairs_must_match():
    claude = pd.DataFrame({"pair": ["pair_00", "pair_01"], "answer": ["yes", "no"]})
    check_same_pairs(pd.DataFrame({"pair": ["pair_01", "pair_00"]}), claude)  # order doesn't matter
    with pytest.raises(ValueError):
        check_same_pairs(pd.DataFrame({"pair": ["pair_00", "pair_05"]}), claude)  # wrong ids
    with pytest.raises(ValueError):
        check_same_pairs(pd.DataFrame({"pair": ["pair_00"]}), claude)  # not finished
