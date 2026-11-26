"""Step 8.9: the surface-temperature extension's maths (no network)."""

import numpy as np
from affine import Affine

from src.lst import by_class, kelvin_to_celsius, square_means


def test_kelvin_to_celsius_and_nodata():
    t = kelvin_to_celsius(np.array([0, 40000]), 0.00341802, 149, 0)
    assert np.isnan(t[0])
    assert abs(t[1] - (40000 * 0.00341802 + 149 - 273.15)) < 1e-9


def test_square_means_reads_the_right_pixels():
    # A 4 x 4 grid of 30 m pixels in UTM zone 43N; left half 20 C, right half 30 C.
    st = np.full((4, 4), 20.0)
    st[:, 2:] = 30.0
    tr = Affine(30, 0, 500000, 0, -30, 2600000)
    from pyproj import Transformer
    back = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
    def square(x0, x1):  # a square over pixel columns x0..x1, all rows, as lon/lat
        pts = [(500000 + x0 * 30, 2600000), (500000 + x1 * 30, 2600000),
               (500000 + x1 * 30, 2600000 - 120), (500000 + x0 * 30, 2600000 - 120)]
        ring = [list(back.transform(x, y)) for x, y in pts]
        return {"geometry": {"coordinates": [ring + [ring[0]]]}, "properties": {"class_y": "A"}}
    rows = square_means(st, tr, "EPSG:32643", [square(0.1, 1.9), square(2.1, 3.9)], "y", 1)
    assert [round(r["lst_c"]) for r in rows] == [20, 30]


def test_by_class_marks_small_classes():
    rows = [{"cls": "A", "lst_c": v} for v in [1, 2, 3, 4, 5]] + [{"cls": "B", "lst_c": 9}]
    t = by_class(rows, min_squares=3)
    assert t["A"]["n_squares"] == 5 and t["A"]["median_c"] == 3 and not t["A"]["too_few"]
    assert t["B"]["too_few"]
