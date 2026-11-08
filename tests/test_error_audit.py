import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch

from src.data import CLASSES
from src.error_audit import assert_no_test_areas, loao_folds
from src.error_audit_report import (
    accuracy_table,
    check_files_exist,
    confusion_counts,
    files_named_in,
    matrix_markdown,
    nearest_square,
    pick_cases,
    pooled_channel_stats,
    top_pairs,
)


def preds_table(rows):
    """rows: (file, true, pred, conf, seed)"""
    return pd.DataFrame(rows, columns=["file", "true", "pred", "conf", "seed"]).assign(
        area="a", model="loao"
    )


def test_assert_no_test_areas_stops_on_test_patch():
    df = pd.DataFrame({"file": ["x.png"], "area": ["vadodara_outskirts"]})
    with pytest.raises(AssertionError):
        assert_no_test_areas(df, ["vadodara_outskirts", "sanand_farmland"])
    assert_no_test_areas(df, ["sanand_farmland"])  # a different test area: fine


def test_loao_folds_never_train_on_the_held_out_area():
    df = pd.DataFrame(
        {
            "file": [f"{a}_{i}.png" for a in "abc" for i in range(3)],
            "area": [a for a in "abc" for _ in range(3)],
        }
    )
    folds = loao_folds(df)
    assert [f[0] for f in folds] == ["a", "b", "c"]
    for area, train, held_out in folds:
        assert set(held_out["area"]) == {area}
        assert area not in set(train["area"])
        assert len(train) == 6 and len(held_out) == 3


def test_confusion_counts_and_top_pairs():
    df = preds_table(
        [
            ("1", "Residential", "Industrial", 0.9, 42),
            ("2", "Residential", "Industrial", 0.8, 42),
            ("3", "Residential", "Residential", 0.7, 42),
            ("4", "River", "AnnualCrop", 0.6, 42),
        ]
    )
    m = confusion_counts(df)
    r, i, c, v = (CLASSES.index(x) for x in ["Residential", "Industrial", "AnnualCrop", "River"])
    assert m[r, i] == 2 and m[r, r] == 1 and m[v, c] == 1 and m.sum() == 4
    assert top_pairs(m, 5) == [
        ("Residential", "Industrial", 2),
        ("River", "AnnualCrop", 1),
    ]
    assert top_pairs(m, 1) == [("Residential", "Industrial", 2)]


def test_accuracy_table_mean_and_sample_std():
    df = preds_table(
        [("1", "River", "River", 1, 42), ("2", "River", "SeaLake", 1, 42)]
        + [("1", "River", "River", 1, 43), ("2", "River", "River", 1, 43)]
    )
    t = accuracy_table(df)
    assert t["per_seed"] == {42: 0.5, 43: 1.0}
    assert t["mean"] == pytest.approx(0.75)
    assert t["std"] == pytest.approx(0.35355339, rel=1e-5)


def test_pick_cases_rule_most_confident_wrong_patch_per_top_pair():
    df = preds_table(
        [
            ("low.png", "Residential", "Industrial", 0.5, 42),
            ("high.png", "Residential", "Industrial", 0.9, 42),
            ("ok.png", "Residential", "Residential", 0.9, 42),
            ("cropriver.png", "River", "AnnualCrop", 0.7, 42),
            ("river2.png", "River", "Highway", 0.6, 42),
        ]
    )
    cases = pick_cases(df, n_pairs=1, n_river=5)
    assert [c["file"] for c in cases] == ["high.png", "cropriver.png", "river2.png"]
    assert cases[0]["why"].startswith("top mistake")
    assert cases[1]["why"].startswith("River")


def test_pick_cases_does_not_list_a_patch_twice():
    df = preds_table(
        [("r1.png", "River", "AnnualCrop", 0.9, 42), ("r2.png", "River", "AnnualCrop", 0.8, 42)]
    )
    cases = pick_cases(df, n_pairs=1, n_river=5)
    assert [c["file"] for c in cases] == ["r1.png", "r2.png"]


def test_nearest_square_returns_closest_and_distance():
    squares = pd.DataFrame({"lat": [23.00, 23.01], "lon": [72.50, 72.50], "tag": ["a", "b"]})
    sq, dist = nearest_square(23.0095, 72.50, squares)
    assert sq["tag"] == "b"
    assert dist == pytest.approx(0.0005 * 110_540, rel=1e-6)


def test_pooled_channel_stats_matches_stacking_all_pixels():
    torch.manual_seed(0)
    images = [torch.rand(3, 4, 4) * (i + 1) / 3 for i in range(3)]
    mean, std = pooled_channel_stats(images)
    stacked = torch.cat([im.reshape(3, -1) for im in images], dim=1)
    assert mean == pytest.approx(stacked.mean(dim=1).tolist(), rel=1e-5)
    assert std == pytest.approx(stacked.std(dim=1, unbiased=False).tolist(), rel=1e-4)


def test_files_named_in_and_check_files_exist():
    text = "see `ahmedabad_city_r0064_c0128.png` and narmada_bharuch_r0000_c0000.png, not x.png"
    assert files_named_in(text) == [
        "ahmedabad_city_r0064_c0128.png",
        "narmada_bharuch_r0000_c0000.png",
    ]
    patches = pd.DataFrame({"file": ["ahmedabad_city_r0064_c0128.png"]})
    with pytest.raises(AssertionError):
        check_files_exist(text, patches)
    check_files_exist("only ahmedabad_city_r0064_c0128.png", patches)


def test_matrix_markdown_keeps_only_classes_that_occur():
    m = np.zeros((10, 10), dtype=int)
    m[CLASSES.index("River"), CLASSES.index("AnnualCrop")] = 3
    md = matrix_markdown(m)
    assert "River" in md and "AnnualCrop" in md and "Forest" not in md


# The saved report, when it exists locally: every patch it names must be a real patch, and no
# TEST area may appear in the predictions it was built from. Skipped where the git-ignored patch
# table is missing (CI).
REPORT = Path("results/error_audit.md")
PATCHES = Path("data/india/patches.csv")


@pytest.mark.skipif(not (REPORT.exists() and PATCHES.exists()), reason="needs local data")
def test_saved_report_names_only_real_patches_and_no_test_areas():
    text = REPORT.read_text(encoding="utf-8")
    assert files_named_in(text), "the report names no patch files"
    check_files_exist(text, pd.read_csv(PATCHES))
    result = json.loads(Path("results/error_audit.json").read_text(encoding="utf-8"))
    assert not set(result["finetune_areas"]) & {"vadodara_outskirts", "sanand_farmland"}
    predictions = pd.read_csv("results/error_audit_predictions.csv")
    assert not set(predictions["area"]) & {"vadodara_outskirts", "sanand_farmland"}


def test_square_share_counts_the_pixels_inside_the_square():
    from src.error_audit_report import square_share

    # 100 x 100 pixel map of a 0.1 x 0.1 degree box; make the left half "water" (class 80)
    data = np.zeros((100, 100), dtype=int)
    data[:, :50] = 80
    bbox = [72.0, 23.0, 72.1, 23.1]
    # a square centred well inside the left half is all water, inside the right half none
    assert square_share(data, bbox, 23.05, 72.02, 80) == pytest.approx(1.0)
    assert square_share(data, bbox, 23.05, 72.08, 80) == pytest.approx(0.0)
    # centred on the edge: about half
    assert square_share(data, bbox, 23.05, 72.05, 80) == pytest.approx(0.5, abs=0.1)


RESULT = Path("results/error_audit.json")


@pytest.mark.skipif(not RESULT.exists(), reason="needs the saved audit result")
def test_causes_template_is_filled_from_the_saved_result_with_nothing_left_over():
    from src.error_audit_report import causes_values

    result = json.loads(RESULT.read_text(encoding="utf-8"))
    template = Path("src/error_audit_causes.md").read_text(encoding="utf-8")
    text = template.format_map(causes_values(result))  # an unknown number name raises KeyError
    assert "{" not in text and "}" not in text
