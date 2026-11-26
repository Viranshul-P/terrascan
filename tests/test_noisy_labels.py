"""Step 8.4: tier-2 WorldCover labels: pure functions, and a check of the saved set if it exists."""

from pathlib import Path

import numpy as np
import pytest
import yaml

from src.noisy_labels import label_set, majority, near_box, worldcover_sets

CFG = yaml.safe_load(Path("configs/noisy_labels.yaml").read_text(encoding="utf-8"))
SETS = worldcover_sets(yaml.safe_load(Path(CFG["class_scheme_config"]).read_text(encoding="utf-8")))


def test_mapping_comes_from_the_82_scheme():
    assert SETS[10] == ["Forest"]
    assert SETS[50] == ["Residential", "Industrial"]
    assert SETS[60] == []  # bare: no EuroSAT class


def test_majority_ignores_no_data():
    assert majority(np.array([0, 0, 0, 50, 50, 40])) == (50, 2 / 3)
    assert majority(np.array([0, 0])) == (None, 0.0)


def test_label_set_drops_mixed_and_unmapped():
    assert label_set(50, 0.9, SETS, 0.7) == ["Residential", "Industrial"]
    assert label_set(50, 0.5, SETS, 0.7) is None
    assert label_set(60, 1.0, SETS, 0.7) is None


def test_near_box_uses_a_buffer_in_km():
    box = [72.0, 23.0, 72.1, 23.1]
    assert near_box(72.05, 23.05, box, 0)
    assert near_box(72.11, 23.05, box, 2.0)  # ~1.0 km east of the box
    assert not near_box(72.13, 23.05, box, 2.0)  # ~3.1 km east


@pytest.mark.skipif(not Path(CFG["out_npz"]).exists(), reason="tier-2 set not built here")
def test_saved_set_has_no_square_near_a_labelled_area():
    d = np.load(CFG["out_npz"])
    areas = yaml.safe_load(Path(CFG["india_config"]).read_text(encoding="utf-8"))["areas"]
    for lon, lat in zip(d["lon"], d["lat"]):
        assert not any(near_box(lon, lat, a["bbox"], CFG["buffer_km"]) for a in areas)
    assert set(d["tier"]) == {"tier2"}
    assert d["allowed"].any(axis=1).all()
