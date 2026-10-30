import pandas as pd
import pytest
from affine import Affine

from src.imagery import patch_centre_lonlat
from src.labeller import SKIP, next_file, read_labels, save_label, shuffled_order


def fake_patches():
    return pd.DataFrame({
        "file": [f"area_r{i:04d}_c0000.png" for i in range(5)],
        "area": ["area"] * 5,
        "lat": [23.0 + i / 100 for i in range(5)],
        "lon": [72.5] * 5,
    })


def test_order_is_shuffled_but_repeatable():
    patches = fake_patches()
    first = shuffled_order(patches, seed=42)
    assert first == shuffled_order(patches, seed=42)
    assert sorted(first) == sorted(patches["file"])


def test_labels_are_saved_and_resume_skips_them(tmp_path):
    labels_csv = tmp_path / "labels.csv"
    patches = fake_patches()
    order = shuffled_order(patches, seed=42)
    assert len(read_labels(labels_csv)) == 0

    save_label(labels_csv, patches.iloc[0], "Forest")
    save_label(labels_csv, patches.iloc[1], SKIP)
    saved = read_labels(labels_csv)  # read back from disk, like a restart
    assert saved.columns.tolist() == ["file", "label", "area", "lat", "lon"]
    assert saved["label"].tolist() == ["Forest", SKIP]
    assert saved["lat"].tolist() == [23.0, 23.01]

    done = set(saved["file"])
    assert next_file(order, done) not in done
    assert next_file(order, set(patches["file"])) is None


def test_same_patch_is_not_saved_twice(tmp_path):
    labels_csv = tmp_path / "labels.csv"
    patch = fake_patches().iloc[0]
    save_label(labels_csv, patch, "Forest")
    save_label(labels_csv, patch, "River")
    assert read_labels(labels_csv)["label"].tolist() == ["Forest"]


def test_unknown_label_is_refused(tmp_path):
    with pytest.raises(ValueError):
        save_label(tmp_path / "labels.csv", fake_patches().iloc[0], "Desert")


def test_patch_centre_lonlat():
    # 10 m UTM grid (zone 43N), top-left corner at x=500000 (zone's centre line, 75 E),
    # y=2,500,000.
    grid = Affine(10, 0, 500000, 0, -10, 2500000)
    lon, lat = patch_centre_lonlat(grid, "EPSG:32643", row=0, col=0, size=64)
    # Centre is 320 m east and 320 m south of the corner: just east of 75 E, at about 22.6 N.
    assert 75.0 < lon < 75.01
    assert 22.5 < lat < 22.7
    lon2, lat2 = patch_centre_lonlat(grid, "EPSG:32643", row=64, col=0, size=64)
    assert lat2 < lat and abs(lon2 - lon) < 1e-6  # one patch further down = further south
