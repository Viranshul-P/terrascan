from types import SimpleNamespace

import numpy as np
import pytest
from affine import Affine

from src.change import (
    change_matrix,
    check_same_grid,
    median_composite,
    one_per_date,
    patch_km2,
    summarise_seed,
)
from src.data import CLASSES


def fake_item(item_id, date, generated):
    props = {"datetime": date + "T05:00:00Z", "s2:generation_time": generated}
    return SimpleNamespace(id=item_id, properties=props)


def test_one_per_date_keeps_newest_copy_sorted_by_date():
    items = [
        fake_item("b", "2019-03-09", "2020-10-07T04:53:45Z"),
        fake_item("b_reprocessed", "2019-03-09", "2022-11-16T02:41:42Z"),
        fake_item("a", "2019-03-04", "2020-10-30T12:45:42Z"),
    ]
    assert [item.id for item in one_per_date(items)] == ["a", "b_reprocessed"]


def test_check_same_grid():
    grid = ("EPSG:32643", (10.0, 0.0, 500.0, 0.0, -10.0, 900.0), (30, 40))
    check_same_grid({"a": grid, "b": grid})
    shifted = ("EPSG:32643", (10.0, 0.0, 510.0, 0.0, -10.0, 900.0), (30, 40))
    with pytest.raises(ValueError):
        check_same_grid({"a": grid, "b": shifted})


def test_median_composite_ignores_no_data_and_outliers():
    shape = (5, 4, 3)
    scenes = [np.full(shape, v, dtype=np.uint16) for v in (100, 110, 120, 5000)]  # 5000 = a cloud
    masks = [np.ones(shape[:2], dtype=bool) for _ in scenes]
    masks[0][0, 0] = False  # scene 0 has no data at pixel (0, 0)
    masks2 = [np.zeros(shape[:2], dtype=bool) for _ in scenes]
    composite, has_data = median_composite(scenes, masks, rows_per_chunk=2)
    assert composite[1, 1].tolist() == [115, 115, 115]          # median of 100, 110, 120, 5000
    assert composite[0, 0].tolist() == [120, 120, 120]          # median of 110, 120, 5000
    assert has_data.all()
    _, none = median_composite(scenes, masks2)
    assert not none.any()


def test_change_matrix_rows_are_first_year():
    m = change_matrix([0, 0, 1, 2], [0, 7, 1, 7], n_classes=10)
    assert m[0, 0] == 1 and m[0, 7] == 1 and m[1, 1] == 1 and m[2, 7] == 1
    assert m.sum() == 4


def test_patch_km2_is_0_4096_at_10m():
    assert patch_km2(Affine(10, 0, 500000, 0, -10, 2500000), 64) == pytest.approx(0.4096)


def test_summarise_seed_areas_and_changes():
    before = np.array([0, 0, 7, 7])
    after = np.array([7, 0, 7, 8])
    outside = np.array([True, True, True, False])
    out = summarise_seed(before, after, 0.4096, outside, ("2018", "2026"))
    assert out["patch_counts"]["2018"]["AnnualCrop"] == 2
    assert out["areas_km2"]["2026"]["Residential"] == pytest.approx(2 * 0.4096)
    assert out["changed_patches"] == 2                    # 0->7 and 7->8
    assert out["changed_patches_outside_finetune"] == 1   # 7->8 is inside a fine-tune area
    m = np.array(out["change_matrix"])
    assert m[CLASSES.index("AnnualCrop"), CLASSES.index("Residential")] == 1
    assert m.sum() == 4
