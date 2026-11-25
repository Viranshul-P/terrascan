"""src/browser_parity.py: the square-by-square comparison (no network)."""

from src.browser_parity import centre_offset_m, compare


def patch(cls, conf=0.9, lon=72.5, lat=23.0):
    return {"cls": cls, "conf": conf, "lon": lon, "lat": lat}


def test_identical_lists_agree_fully():
    a = [patch("Forest"), patch("River", 0.5, 72.51)]
    r = compare(a, [dict(p) for p in a])
    assert r["same_squares"] and r["class_agreement"] == 1.0
    assert r["max_centre_offset_m"] == 0.0 and r["max_confidence_diff"] == 0.0


def test_counts_disagreements_and_offsets():
    b = [patch("Forest", 0.9), patch("River", 0.5)]
    p = [patch("Forest", 0.8), patch("SeaLake", 0.5, lat=23.0001)]
    r = compare(b, p)
    assert r["same_class"] == 1 and r["class_agreement"] == 0.5
    assert abs(r["max_confidence_diff"] - 0.1) < 1e-9
    assert 11 < r["max_centre_offset_m"] < 11.3  # 0.0001 degree of latitude is about 11.1 m


def test_different_square_counts_are_not_paired():
    r = compare([patch("Forest")], [patch("Forest"), patch("River")])
    assert not r["same_squares"] and r["class_agreement"] is None


def test_centre_offset_east_west_shrinks_with_latitude():
    assert centre_offset_m((0, 60), (0.001, 60)) < centre_offset_m((0, 0), (0.001, 0))
