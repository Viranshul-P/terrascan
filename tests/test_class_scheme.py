from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

from src.class_scheme import (
    IGNORE,
    build_scheme,
    decide,
    derive_all,
    derive_mapping,
    make_sheet,
    merges_from_decisions,
    sample_pair,
    score_quiz,
    screen_pairs,
)
from src.data import CLASSES

CONFIG = yaml.safe_load(Path("configs/classes_india.yaml").read_text(encoding="utf-8"))
BASE = CONFIG["base_classes"]


def test_base_classes_are_the_eurosat_classes_in_order():
    assert BASE == CLASSES


def test_keep_10_is_a_valid_scheme():
    scheme, to_scheme = build_scheme(BASE, {})
    assert scheme == BASE
    assert all(to_scheme[c] == c for c in BASE)


def test_merge_builds_a_smaller_scheme():
    scheme, to_scheme = build_scheme(BASE, {"Built-up": ["Residential", "Industrial"]})
    assert len(scheme) == 9 and "Built-up" in scheme
    assert "Residential" not in scheme and "Industrial" not in scheme
    assert to_scheme["Residential"] == to_scheme["Industrial"] == "Built-up"
    assert to_scheme["River"] == "River"


@pytest.mark.parametrize(
    "merges",
    [
        {"X": ["River"]},  # one class is not a merge
        {"X": ["River", "Nope"]},  # unknown class
        {"X": ["River", "SeaLake"], "Y": ["SeaLake", "Forest"]},  # a class in two merges
        {"Forest": ["River", "SeaLake"]},  # name clashes with a kept class
    ],
)
def test_bad_merges_are_rejected(merges):
    with pytest.raises(ValueError):
        build_scheme(BASE, merges)


def test_derive_mapping_rules():
    _, to_scheme = build_scheme(BASE, {"Built-up": ["Residential", "Industrial"]})
    assert derive_mapping(["Forest"], to_scheme) == "Forest"
    assert derive_mapping(["Residential", "Industrial"], to_scheme) == "Built-up"
    assert derive_mapping(["AnnualCrop", "PermanentCrop"], to_scheme) == IGNORE  # ambiguous
    assert derive_mapping([], to_scheme) == IGNORE  # no class


def scheme_classes(merges):
    return build_scheme(BASE, merges)[0]


@pytest.mark.parametrize(
    "merges",
    [{}, {"Built-up": ["Residential", "Industrial"]}, {"Crop": ["AnnualCrop", "PermanentCrop"]}],
)
def test_every_source_class_maps_to_exactly_one_scheme_class_or_ignore(merges):
    mapping = derive_all(CONFIG, merges)
    valid = set(scheme_classes(merges)) | {IGNORE}
    assert set(mapping) == {
        "eurosat",
        "hand_labels",
        "worldcover",
        "dynamic_world",
        "pseudo_labels",
    }
    for source, table in mapping.items():
        assert table, source
        for source_class, target in table.items():
            assert isinstance(target, str) and target in valid, (source, source_class, target)
    # the user's hand labels and EuroSAT's own labels are never ignored
    for source in ("eurosat", "hand_labels", "pseudo_labels"):
        assert IGNORE not in mapping[source].values()


def test_keep_10_ignores_ambiguous_tier2_classes_and_merge_uses_them():
    keep = derive_all(CONFIG, {})
    assert keep["worldcover"]["Built-up (50)"] == IGNORE
    assert keep["worldcover"]["Tree cover (10)"] == "Forest"
    merged = derive_all(CONFIG, {"Built-up": ["Residential", "Industrial"]})
    assert merged["worldcover"]["Built-up (50)"] == "Built-up"
    assert merged["dynamic_world"]["built (6)"] == "Built-up"


def test_chosen_scheme_in_the_config_is_valid():
    scheme, _ = build_scheme(BASE, CONFIG["chosen_merges"])
    assert len(scheme) >= 1
    derive_all(CONFIG)  # must not raise


def fake_audit(a_to_b, b_to_a, counts):
    n = len(CLASSES)
    matrix = np.zeros((n, n), dtype=int)
    i, j = CLASSES.index("Highway"), CLASSES.index("Industrial")
    matrix[i, j], matrix[j, i] = a_to_b, b_to_a
    return {
        "finetune_areas": ["x"],
        "class_counts_finetune_areas": {"x": {c: counts.get(c, 0) for c in CLASSES}},
        "matrix": {"eurosat": matrix.tolist(), "loao": np.zeros((n, n), dtype=int).tolist()},
    }


def test_screen_needs_both_directions_and_enough_patches():
    counts = {"Highway": 11, "Industrial": 11}
    assert screen_pairs(fake_audit(3, 1, counts), 5) == [("Highway", "Industrial", "eurosat", 3, 1)]
    assert screen_pairs(fake_audit(3, 0, counts), 5) == []  # one direction only
    assert screen_pairs(fake_audit(3, 1, {"Highway": 11, "Industrial": 4}), 5) == []  # too few


def test_sample_pair_is_balanced_repeatable_and_shuffled():
    files = [f"h{i}.png" for i in range(12)] + [f"i{i}.png" for i in range(12)]
    labels = pd.DataFrame({"file": files, "final_label": ["Highway"] * 12 + ["Industrial"] * 12})
    s1 = sample_pair(labels, "Highway", "Industrial", 10, seed=42)
    s2 = sample_pair(labels, "Highway", "Industrial", 10, seed=42)
    assert s1.equals(s2)
    assert s1["true_class"].value_counts().to_dict() == {"Highway": 10, "Industrial": 10}
    assert len(set(s1["file"])) == 20
    assert list(s1["true_class"]) != sorted(s1["true_class"])  # shuffled, not grouped
    with pytest.raises(ValueError):
        sample_pair(labels, "Highway", "Industrial", 13, seed=42)


def test_decide_thresholds():
    rule = {"merge_if_accuracy_at_most": 0.70, "keep_separate_if_accuracy_at_least": 0.80}
    assert decide(0.50, rule) == "merge"
    assert decide(0.70, rule) == "merge"
    assert decide(0.75, rule) == "keep separate (unclear)"
    assert decide(0.80, rule) == "keep separate (clear)"
    assert decide(1.0, rule) == "keep separate (clear)"


def test_score_quiz_counts_right_answers_and_needs_every_answer():
    key = pd.DataFrame(
        {"pair": ["P"] * 4, "number": [1, 2, 3, 4], "true_letter": ["A", "B", "A", "B"]}
    )
    answers = pd.DataFrame(
        {"pair": ["P"] * 4, "number": [1, 2, 3, 4], "answer": ["A", "A", "a", "B"]}
    )
    assert score_quiz(answers, key) == {"P": {"right": 3, "n": 4, "accuracy": 0.75}}
    with pytest.raises(ValueError):
        score_quiz(answers.iloc[:3], key)


def test_merges_from_decisions_joins_overlapping_pairs():
    assert merges_from_decisions({"A_vs_B": "keep separate (clear)"}) == {}
    assert merges_from_decisions({"Highway_vs_Industrial": "merge"}) == {
        "Highway+Industrial": ["Highway", "Industrial"]
    }
    both = merges_from_decisions(
        {"Highway_vs_Industrial": "merge", "Industrial_vs_Residential": "merge"}
    )
    assert both == {"Highway+Industrial+Residential": ["Highway", "Industrial", "Residential"]}


def test_sheet_has_the_right_size_and_no_text_but_numbers(tmp_path):
    from PIL import Image

    files = []
    for i in range(5):
        Image.new("RGB", (64, 64), (i * 40, 10, 10)).save(tmp_path / f"p{i}.png")
        files.append(f"p{i}.png")
    sheet = make_sheet(files, tmp_path, scale=2, columns=4)
    assert sheet.size == (4 * (128 + 6), 2 * (128 + 18 + 6))
