from types import SimpleNamespace

import numpy as np

from src.imagery import (
    apply_calibration,
    cut_patches,
    eurosat_to_dn,
    fit_calibration,
    needs_offset_fix,
    parse_baseline,
    remove_offset,
    to_eurosat_rgb,
)


def fake_scene(baseline):
    """Stands in for a STAC item: only the property the offset logic reads."""
    return SimpleNamespace(properties={"s2:processing_baseline": baseline})


def test_parse_baseline_compares_as_numbers():
    assert parse_baseline("05.12") == (5, 12)
    assert parse_baseline("04.00") >= (4, 0)
    assert parse_baseline("03.01") < (4, 0)


def test_baseline_03_scene_is_left_alone():
    scene = fake_scene("03.01")
    dn = np.array([[0, 500, 2750]], dtype=np.uint16)
    assert not needs_offset_fix(scene)
    assert remove_offset(dn, scene).tolist() == [[0, 500, 2750]]


def test_baseline_05_scene_loses_1000():
    scene = fake_scene("05.09")
    dn = np.array([[1000, 1500, 3750]], dtype=np.uint16)
    assert needs_offset_fix(scene)
    assert remove_offset(dn, scene).tolist() == [[0, 500, 2750]]


def test_offset_never_goes_below_zero():
    scene = fake_scene("04.00")  # exactly 04.00 counts
    dn = np.array([[0, 999]], dtype=np.uint16)  # no uint16 wrap-around to 65xxx
    assert remove_offset(dn, scene).tolist() == [[0, 0]]


def test_same_ground_gives_same_value_in_both_baselines():
    old, new = fake_scene("03.01"), fake_scene("05.12")
    ground = np.array([[123, 2000]], dtype=np.uint16)
    assert (remove_offset(ground, old) == remove_offset(ground + 1000, new)).all()


def test_eurosat_stretch():
    rgb = to_eurosat_rgb(np.array([0, 2750, 5000]), scale_max=2750)
    assert rgb.dtype == np.uint8
    assert rgb.tolist() == [1, 255, 255]  # 0 -> 1, max -> 255, brighter clipped
    assert to_eurosat_rgb(np.array([1375]), 2750).tolist() == [128]  # halfway


def test_cut_patches_drops_no_data_and_edges():
    rgb = np.zeros((130, 150, 3), dtype=np.uint8)
    has_data = np.ones((130, 150), dtype=bool)
    has_data[70, 70] = False  # one missing pixel in the bottom-right full patch
    patches = cut_patches(rgb, has_data, size=64)
    assert [(r, c) for r, c, _ in patches] == [(0, 0), (0, 64), (64, 0)]
    assert all(p.shape == (64, 64, 3) for _, _, p in patches)


def test_eurosat_to_dn_undoes_the_stretch():
    dn = np.array([0, 1375, 2750])
    assert np.allclose(eurosat_to_dn(to_eurosat_rgb(dn, 2750), 2750), dn, atol=2750 / 254)


def test_fit_calibration_finds_a_known_line():
    rng = np.random.default_rng(0)
    ours = rng.uniform(0, 2000, size=(5000, 3))
    target = ours * np.array([1.0, 0.9, 0.8]) + np.array([100.0, 300.0, 600.0])  # more haze in blue
    rng.shuffle(target)  # different order: only the spread matters, not which pixel is which
    calibration = fit_calibration(ours, target, percentiles=range(5, 100, 5))
    assert np.allclose(calibration["gain"], [1.0, 0.9, 0.8], atol=1e-6)
    assert np.allclose(calibration["shift"], [100.0, 300.0, 600.0], atol=1e-3)


def test_apply_calibration_never_negative():
    calibration = {"gain": [1.0, 1.0, 2.0], "shift": [-50.0, 0.0, 10.0]}
    out = apply_calibration(np.array([[10, 10, 10]]), calibration)
    assert out.tolist() == [[0.0, 10.0, 30.0]]
