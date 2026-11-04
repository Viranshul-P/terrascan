"""Step 5.2a: static showcase files, built from a small saved tile (no network, no real model)."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
import yaml
from affine import Affine
from PIL import Image

from src.data import CLASSES
from src.imagery import cut_patches, values_to_rgb
from src.showcase import NO_CLASS, check_against_47, class_grid, write_city

TILE = Path("tests/fixtures/ahmedabad_tile.npz")  # 192x192 px = 3x3 patches, real values
CONFIG = Path("configs/showcase.yaml")


def fake_city(tmp_path):
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    colours = yaml.safe_load(Path(cfg["change_config"]).read_text(encoding="utf-8"))[
        "class_colours"]
    calibration = json.loads(Path(cfg["calibration_path"]).read_text(encoding="utf-8"))
    tile = np.load(TILE)
    crs, grid_transform = str(tile["crs"]), Affine(*tile["grid"])
    built, patches = {}, {}
    for y in cfg["years"]:
        rgb = values_to_rgb(tile[f"values_{y}"].astype(np.float32), calibration, cfg["scale_max"])
        scenes = [{"id": f"scene_{y}", "date": f"{y}-01-01"}]
        built[y] = {"rgb": rgb, "scenes": scenes}
        patches[y] = cut_patches(rgb, tile["has_data"], cfg["patch_size"])
    rows = [r for r, _, _ in patches["2018"]]
    cols = [c for _, c, _ in patches["2018"]]
    n = len(rows)
    # Fake model output: 2018 all AnnualCrop, 2026 Residential for the first 4 patches.
    preds = {
        "2018": (np.zeros(n, dtype=int), np.full(n, 0.9, dtype=np.float32)),
        "2026": (np.array([7] * 4 + [0] * (n - 4)), np.full(n, 0.6, dtype=np.float32)),
    }
    city = {"id": "test", "name": "Test", "bbox": [72.5, 23.0, 72.6, 23.1], "tile": "43QBF"}
    out = tmp_path / "test"
    summary = write_city(out, city, cfg, built, crs, grid_transform, tile["values_2018"].shape,
                         preds, rows, cols, [[72.0, 22.0, 72.1, 22.1]], colours)
    return out, summary, grid_transform, n


def test_class_grid_places_patches():
    grid = class_grid([0, 64], [64, 0], [3, 5], (128, 192), 64)
    assert grid.shape == (2, 3)
    assert grid[0, 1] == 3 and grid[1, 0] == 5
    assert (grid == NO_CLASS).sum() == 4


def test_all_files_written(tmp_path):
    out, summary, _, n = fake_city(tmp_path)
    assert n == 9
    for y in ["2018", "2026"]:
        for name in summary["files"].values():
            path = out / (name[y] if isinstance(name, dict) else name)
            assert path.exists(), path
        assert Image.open(out / f"overlay_{y}.png").size == (3, 3)
        assert Image.open(out / f"rgb_{y}.webp").size == (96, 96)  # 192 px / downscale 2
    assert json.loads((out / "summary.json").read_text(encoding="utf-8")) == summary


def test_geotiff_has_right_position_and_classes(tmp_path):
    out, _, grid_transform, _ = fake_city(tmp_path)
    with rasterio.open(out / "classes_2026.tif") as src:
        assert src.crs.to_string() == "EPSG:32643"
        assert src.transform.a == 640 and src.transform.e == -640  # one pixel = one patch
        assert (src.transform.c, src.transform.f) == (grid_transform.c, grid_transform.f)
        data = src.read(1)
        assert src.nodata == NO_CLASS
    assert (data == 7).sum() == 4 and (data == 0).sum() == 5


def test_summary_numbers_add_up(tmp_path):
    _, summary, _, n = fake_city(tmp_path)
    km2 = summary["km2_per_patch"]
    assert km2 == 0.4096
    for y in ["2018", "2026"]:
        assert sum(summary["patch_counts"][y].values()) == n
        assert abs(sum(summary["areas_km2"][y].values()) - n * km2) < 1e-6
    assert summary["changed_patches"] == 4
    assert summary["changes"] == [
        {"from": "AnnualCrop", "to": "Residential", "patches": 4, "km2": round(4 * km2, 4)}
    ]
    assert summary["n_patches_touching_finetune_area"] == 0


def test_corners_and_geojson_are_in_ahmedabad(tmp_path):
    out, summary, _, n = fake_city(tmp_path)
    tl, tr, br, bl = summary["overlay_corners"]
    assert tr[0] > tl[0] and tl[1] > bl[1]  # top-left, top-right, bottom-right, bottom-left
    for lon, lat in summary["overlay_corners"]:
        assert 72.4 < lon < 72.7 and 22.9 < lat < 23.15  # inside the 4.7 Ahmedabad box
    geo = json.loads((out / "patches.geojson").read_text(encoding="utf-8"))
    assert len(geo["features"]) == n
    ring = geo["features"][0]["geometry"]["coordinates"][0]
    assert len(ring) == 5 and ring[0] == ring[-1]
    props = geo["features"][0]["properties"]
    assert props["class_2026"] == CLASSES[7] and props["changed"] is True


def test_check_against_47(tmp_path):
    table = pd.DataFrame({"row": [0, 0], "col": [0, 64], "class_2018": ["A", "B"],
                          "class_2026": ["A", "C"]})
    old = pd.DataFrame({"row": [0, 0], "col": [0, 64], "pred_2018_seed42": ["A", "B"],
                        "pred_2026_seed42": ["A", "B"]})
    old.to_csv(tmp_path / "old.csv", index=False)
    result = check_against_47(table, tmp_path / "old.csv", 42, ["2018", "2026"])
    assert result == {"patches_here": 2, "patches_in_4_7": 2, "matched": 2,
                      "different_class_2018": 0, "different_class_2026": 1}
