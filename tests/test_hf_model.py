"""Step 6.1: model card numbers come from the results files; the upload folder is complete."""

import json
import re
from pathlib import Path

import numpy as np
import pytest
import yaml

from src.hf_model import build_folder, build_numbers, make_card, per_class_rows, points

CONFIG = yaml.safe_load(Path("configs/hf_model.yaml").read_text(encoding="utf-8"))
# models/ is git-ignored, so the tests that need real weights are skipped on CI.
HAVE_MODELS = Path(CONFIG["model_dir"], "model.onnx").exists() and Path(
    "models/efficientnet_b0_india_nomix/seed42/metrics.json"
).exists()
needs_models = pytest.mark.skipif(not HAVE_MODELS, reason="models/ is not on this machine")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def test_points():
    assert points(0.4486, 0.6831) == "23.5"
    assert points(0.9828, 0.9869) == "0.4"


def test_per_class_rows_skips_absent_classes():
    per_class = {
        name: {"true_count": 0, "predicted_count": 0, "f1": None}
        for name in ["AnnualCrop", "Forest", "River"]
    }
    per_class["Forest"] = {"true_count": 4, "predicted_count": 1, "f1": 0.4}
    # classes missing from the dict would fail loudly; use the full list
    from src.classes import CLASSES

    empty = {"true_count": 0, "predicted_count": 0, "f1": None}
    full = {c: per_class.get(c, empty) for c in CLASSES}
    assert per_class_rows(full) == "| Forest | 4 | 1 | 0.40 |"


def test_card_claims_about_overlap_are_true():
    # The card says the India gain and the EuroSAT drop both have non-overlapping ranges.
    s = read(CONFIG["results"]["india_after"])["summary_mean_std_over_seeds"]

    def span(e):
        return e["mean"] - e["std"], e["mean"] + e["std"]

    b, a = span(s["india_test_accuracy_before"]), span(s["india_test_accuracy_after"])
    assert b[1] < a[0]
    b, a = span(s["eurosat_test_accuracy_before"]), span(s["eurosat_test_accuracy_after"])
    assert a[1] < b[0]


@needs_models
def test_card_numbers_come_from_results_and_nothing_is_left_unfilled():
    numbers = build_numbers(CONFIG)
    card = make_card(numbers, Path(CONFIG["card_template"]).read_text(encoding="utf-8"))
    assert not re.search(r"\{[a-z_]+\}", card)  # every placeholder filled

    s = read(CONFIG["results"]["india_after"])["summary_mean_std_over_seeds"]
    before = s["india_test_accuracy_before"]
    # CLAUDE.md rule: "before" is the 3-seed number, never the seed-42-only 0.444.
    assert numbers["india_acc_before"] == f"{before['mean']:.4f} ± {before['std']:.4f}"
    assert "0.4486 ± 0.0071" in card
    assert "0.444 " not in card

    check = read(CONFIG["results"]["change_check"])
    assert numbers["reported_changed_km2"] == f"{check['reported_changed_km2']:.0f}"
    assert numbers["real_km2"] == f"{check['estimated_real_changed_km2']:.0f}"
    assert numbers["n_india_test"] == 81


def test_build_folder_copies_files_and_card(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    for name in ["a.onnx", "b.pt"]:
        (model_dir / name).write_bytes(b"x")
    cfg = {
        "out_dir": str(tmp_path / "out"),
        "model_dir": str(model_dir),
        "files": ["a.onnx", "b.pt"],
    }
    out = build_folder(cfg, "card text")
    assert sorted(p.name for p in out.iterdir()) == ["README.md", "a.onnx", "b.pt"]
    assert (out / "README.md").read_text(encoding="utf-8") == "card text"


@needs_models
def test_uploaded_onnx_loads_and_predicts():
    from src.onnx_predict import load_model, predict

    folder = Path(CONFIG["model_dir"])
    session, info = load_model(folder / "model.onnx", folder / "onnx_info.json")
    classes, confidence = predict(session, info, np.zeros((2, 64, 64, 3), dtype=np.uint8))
    assert len(classes) == 2 and all(0 <= c < 10 for c in classes)
    assert all(0.0 < p <= 1.0 for p in confidence)
