"""Step 6.3: README numbers come from the results files, and every link and image in it exists."""

import json
import re
from pathlib import Path

import pytest
import yaml

from src.readme import (
    audit_numbers,
    broken_links,
    build_readme_numbers,
    make_readme,
    ranges_overlap,
    summarise,
)

CONFIG = yaml.safe_load(Path("configs/readme.yaml").read_text(encoding="utf-8"))
# models/ is git-ignored, so the tests that rebuild the whole README are skipped on CI.
HAVE_MODELS = Path("models/efficientnet_b0_india_nomix/seed42/metrics.json").exists() and Path(
    "models/efficientnet_b0_patience15/seed42/metrics.json"
).exists()
needs_models = pytest.mark.skipif(not HAVE_MODELS, reason="models/ is not on this machine")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def test_summarise_uses_sample_std_and_zero_for_one_seed():
    assert summarise([0.9, 0.9, 0.9]) == (pytest.approx(0.9), 0.0)
    mean, std = summarise([1.0, 3.0])
    assert mean == 2.0 and std == pytest.approx(1.4142, abs=1e-4)
    assert summarise([0.5]) == (0.5, 0.0)


def test_ranges_overlap():
    assert ranges_overlap((0.9874, 0.0007), (0.9869, 0.0013))
    assert not ranges_overlap((0.9615, 0.0), (0.9874, 0.0007))


def test_broken_links_finds_missing_files_only(tmp_path):
    (tmp_path / "a.png").write_bytes(b"x")
    text = "![a](a.png) [b](missing.png) [web](https://example.com/x) [top](#known-limitations)"
    assert broken_links(text, root=tmp_path) == ["missing.png"]


def test_audit_numbers_match_the_audit_file():
    audit = read("results/error_audit.json")
    n = audit_numbers(audit)
    water = audit["live_site_vs_worldcover"]["Permanent water bodies"]["live_site_class_2026"]
    assert n["water_as_river"] == water["River"]
    assert n["water_as_crop"] == water.get("AnnualCrop", 0)
    # Residential -> Industrial counted straight from the matrix (classes are alphabetical)
    assert n["res_to_ind"] == audit["matrix"]["loao"][7][4]
    assert n["res_total"] == sum(audit["matrix"]["loao"][7])


@needs_models
def test_readme_numbers_come_from_the_results_files():
    numbers = build_readme_numbers(CONFIG)
    summary = read("results/india_after.json")["summary_mean_std_over_seeds"]
    before = summary["india_test_accuracy_before"]
    # CLAUDE.md: "before" is the 3-seed number (not the seed-42-only one of india_before.json)
    assert numbers["india_acc_before"] == f"{before['mean']:.4f} ± {before['std']:.4f}"
    assert numbers["india_acc_before"] == "0.4486 ± 0.0071"
    assert numbers["published_acc"] == "98.57%"


@needs_models
def test_readme_is_up_to_date_and_has_no_unfilled_or_broken_parts():
    numbers = build_readme_numbers(CONFIG)
    text = make_readme(numbers, Path(CONFIG["template"]).read_text(encoding="utf-8"))
    assert not re.search(r"\{[a-z_0-9]+\}", text)
    assert broken_links(text) == []
    written = Path(CONFIG["output"]).read_text(encoding="utf-8")
    assert written == text, "run: python -m src.readme --config configs/readme.yaml"
    # honesty rule: EuroSAT accuracy is "consistent with published results", not "beats SOTA"
    assert "consistent with published results" in text
    assert "not a comparison against the state of the art" in text


def test_readme_template_exists_and_names_its_limits():
    template = Path(CONFIG["template"]).read_text(encoding="utf-8")
    assert "## Known limitations" in template
    assert "Sabarmati" in template
    assert "Residential areas are sometimes predicted as industrial" in template
    assert "European" in template and "small Indian dataset" in template
