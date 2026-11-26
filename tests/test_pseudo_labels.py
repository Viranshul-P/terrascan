"""Step 8.6 (c): pseudo-labels are saved with the tier-3 flag."""

import numpy as np

from src.pseudo_labels import save_tier3


def test_pseudo_labels_carry_the_tier3_flag(tmp_path):
    path = tmp_path / "p.npz"
    save_tier3(path, np.array([3, 7]), np.array([0, 7]), np.array([0.95, 0.91]), "area_x", 42)
    d = np.load(path)
    assert list(d["tier"]) == ["tier3", "tier3"]
    assert list(d["label"]) == ["AnnualCrop", "Residential"]
    assert str(d["held_out_area"]) == "area_x" and int(d["seed"]) == 42
