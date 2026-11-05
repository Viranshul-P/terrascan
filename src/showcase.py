"""Step 5.2a: pre-computed land-use maps for the website, as static files.

For each city in configs/showcase.yaml and each of the two years:
  1. Median composite of the clear dry-season scenes of one tile (same code as step 4.7,
     src/change.py build_year: one scene per date, +1000 offset removed per scene).
  2. EuroSAT-style RGB (same calibration as 4.2/4.7), 64x64 patches with data in BOTH years.
  3. The exported ONNX model (5.1) gives each patch a class and a confidence.
Then it writes everything the website needs into web/public/data/<city>/:
  overlay_<year>.png   one pixel per patch, coloured by class (transparent = no patch)
  rgb_<year>.webp      the satellite picture (calibrated RGB), same extent as the overlay
  classes_<year>.tif   GeoTIFF, one pixel per patch = class number (255 = none), map coordinates
  map_<year>.png       a readable map with a legend, for download
  patches.geojson      each patch's outline, class and confidence in both years (for hover)
  patches.csv          the same as a table
  summary.json         km2 per class, the from -> to change table, corners for the map
and web/public/data/index.json lists the cities, classes and colours.

Run from the repo root: python -m src.showcase --config configs/showcase.yaml [--city surat]
"""

import argparse
import json
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
import rasterio
import yaml
from affine import Affine
from PIL import Image
from rasterio.transform import xy
from rasterio.warp import transform
from shapely.geometry import box

from src.classes import CLASSES
from src.composite import (
    build_year,
    change_matrix,
    check_same_grid,
    patch_km2,
    save_class_map,
)
from src.imagery import cut_patches, values_to_rgb
from src.onnx_predict import load_model, predict

NO_CLASS = 255  # GeoTIFF / grid value for "no patch here"


def class_grid(rows, cols, classes, shape, size):
    """One cell per patch position: the class number, NO_CLASS where there is no patch."""
    grid = np.full((shape[0] // size, shape[1] // size), NO_CLASS, dtype=np.uint8)
    grid[np.asarray(rows) // size, np.asarray(cols) // size] = classes
    return grid


def overlay_rgba(grid, colours):
    """Colour each cell by its class; fully transparent where there is no patch."""
    palette = np.array([[round(v * 255) for v in matplotlib.colors.to_rgb(colours[c])]
                        for c in CLASSES], dtype=np.uint8)
    rgba = np.zeros(grid.shape + (4,), dtype=np.uint8)
    has = grid != NO_CLASS
    rgba[has, :3] = palette[grid[has]]
    rgba[has, 3] = 255
    return rgba


def to_lonlat(grid_transform, crs, pixel_rowcols):
    """[(row, col), ...] pixel corners -> [[lon, lat], ...] (6 decimals, about 0.1 m)."""
    xs, ys = zip(*[xy(grid_transform, r, c, offset="ul") for r, c in pixel_rowcols])
    lons, lats = transform(crs, "EPSG:4326", list(xs), list(ys))
    return [[round(lon, 6), round(lat, 6)] for lon, lat in zip(lons, lats)]


def grid_corners(grid_transform, crs, grid_shape, size):
    """Corners of the whole patch grid: top-left, top-right, bottom-right, bottom-left.

    This is the order MapLibre's image source expects. The grid is in UTM metres, so in lon/lat
    it is very slightly rotated; giving all 4 corners keeps the overlay in the right place.
    """
    h, w = grid_shape[0] * size, grid_shape[1] * size
    return to_lonlat(grid_transform, crs, [(0, 0), (0, w), (h, w), (h, 0)])


def write_geotiff(path, grid, grid_transform, crs, size, colours):
    """One pixel per patch (640 m), class number as value, correct map position and projection."""
    profile = {
        "driver": "GTiff", "height": grid.shape[0], "width": grid.shape[1], "count": 1,
        "dtype": "uint8", "crs": crs, "transform": grid_transform @ Affine.scale(size),
        "nodata": NO_CLASS, "compress": "deflate",
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(grid, 1)
        dst.write_colormap(1, {
            i: tuple(round(v * 255) for v in matplotlib.colors.to_rgb(colours[c])) + (255,)
            for i, c in enumerate(CLASSES)
        })
        dst.update_tags(classes=",".join(CLASSES), no_class=str(NO_CLASS))


def patch_table(rows, cols, preds, years, grid_transform, crs, size, finetune_boxes):
    """One row per patch: position, outline (lon/lat), class and confidence for each year.

    With two years there is also a "changed" column. The live API (5.2b) uses one year.
    """
    table = pd.DataFrame({"row": rows, "col": cols})
    outlines = [
        to_lonlat(grid_transform, crs,
                  [(r, c), (r, c + size), (r + size, c + size), (r + size, c)])
        for r, c in zip(rows, cols)
    ]
    table["lon"] = [round(sum(p[0] for p in o) / 4, 6) for o in outlines]
    table["lat"] = [round(sum(p[1] for p in o) / 4, 6) for o in outlines]
    for year in years:
        classes, confidence = preds[year]
        table[f"class_{year}"] = [CLASSES[k] for k in classes]
        table[f"confidence_{year}"] = np.round(confidence, 3)
    if len(years) == 2:
        table["changed"] = table[f"class_{years[0]}"] != table[f"class_{years[1]}"]
    table["touches_finetune_area"] = [
        any(box(*b).intersects(box(min(p[0] for p in o), min(p[1] for p in o),
                                   max(p[0] for p in o), max(p[1] for p in o)))
            for b in finetune_boxes)
        for o in outlines
    ]
    return table, outlines


def patches_geojson(table, outlines, years):
    """GeoJSON for MapLibre: one polygon per patch with its classes and confidences."""
    features = []
    for i, (row, outline) in enumerate(zip(table.itertuples(index=False), outlines)):
        props = {"id": i}
        for year in years:
            props[f"class_{year}"] = getattr(row, f"class_{year}")
            props[f"confidence_{year}"] = float(getattr(row, f"confidence_{year}"))
        if len(years) == 2:
            props["changed"] = bool(row.changed)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [outline + [outline[0]]]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


def city_summary(city, windows, preds, km2_per_patch, scenes, corners, grid_shape, n_touching):
    """km2 per class, the from -> to change table and what the map needs, for one city.

    windows: {year: date window}, e.g. {"2018": "2017-12-01/2018-02-28", ...}.
    """
    years = list(windows)
    before, after = preds[years[0]][0], preds[years[1]][0]
    matrix = change_matrix(before, after, len(CLASSES))
    changes = [
        {"from": CLASSES[i], "to": CLASSES[j], "patches": int(matrix[i, j]),
         "km2": round(int(matrix[i, j]) * km2_per_patch, 4)}
        for i in range(len(CLASSES)) for j in range(len(CLASSES))
        if i != j and matrix[i, j] > 0
    ]
    changes.sort(key=lambda c: -c["patches"])
    counts = {y: np.bincount(preds[y][0], minlength=len(CLASSES)) for y in years}
    changed = int((before != after).sum())
    return {
        "id": city["id"],
        "name": city["name"],
        "bbox": city["bbox"],
        "tile": city["tile"],
        "years": {
            y: {"window": w, "n_scenes": len(scenes[y]),
                "first_date": scenes[y][0]["date"], "last_date": scenes[y][-1]["date"],
                "scenes": [s["id"] for s in scenes[y]]}
            for y, w in windows.items()
        },
        "overlay_corners": corners,
        "grid_rows": int(grid_shape[0]),
        "grid_cols": int(grid_shape[1]),
        "km2_per_patch": round(km2_per_patch, 6),
        "n_patches": int(len(before)),
        "n_patches_touching_finetune_area": int(n_touching),
        "patch_counts": {y: dict(zip(CLASSES, counts[y].tolist())) for y in years},
        "areas_km2": {
            y: {c: round(int(n) * km2_per_patch, 4) for c, n in zip(CLASSES, counts[y])}
            for y in years
        },
        "mean_confidence": {y: round(float(preds[y][1].mean()), 4) for y in years},
        "changed_patches": changed,
        "changed_km2": round(changed * km2_per_patch, 4),
        "changes": changes,
    }


def write_city(out, city, cfg, built, crs, grid_transform, shape, preds, rows, cols,
               finetune_boxes, colours):
    """Write every file for one city into out (a folder). Returns the summary dict."""
    size, years = cfg["patch_size"], list(cfg["years"])
    out.mkdir(parents=True, exist_ok=True)
    km2 = patch_km2(grid_transform, size)
    grids = {y: class_grid(rows, cols, preds[y][0], shape, size) for y in years}
    grid_shape = grids[years[0]].shape
    corners = grid_corners(grid_transform, crs, grid_shape, size)
    h, w = grid_shape[0] * size, grid_shape[1] * size
    k = cfg["rgb_downscale"]
    for y in years:
        Image.fromarray(overlay_rgba(grids[y], colours)).save(out / f"overlay_{y}.png")
        rgb = Image.fromarray(built[y]["rgb"][:h, :w])  # same extent as the overlay
        rgb.reduce(k).save(out / f"rgb_{y}.webp", quality=cfg["rgb_webp_quality"])
        write_geotiff(out / f"classes_{y}.tif", grids[y], grid_transform, crs, size, colours)
        title = (f"{city['name']} {y}: predicted land use per 640 m patch "
                 f"(TerraScan, fine-tuned EfficientNet-B0, seed 42)")
        save_class_map(rows, cols, preds[y][0], shape, size, colours, title, out / f"map_{y}.png")
    table, outlines = patch_table(rows, cols, preds, years, grid_transform, crs, size,
                                  finetune_boxes)
    table.to_csv(out / "patches.csv", index=False)
    geojson = patches_geojson(table, outlines, years)
    (out / "patches.geojson").write_text(json.dumps(geojson, separators=(",", ":")),
                                         encoding="utf-8")
    scenes = {y: built[y]["scenes"] for y in years}
    summary = city_summary(city, cfg["years"], preds, km2, scenes, corners, grid_shape,
                           table["touches_finetune_area"].sum())
    summary["files"] = {
        "overlay": {y: f"overlay_{y}.png" for y in years},
        "rgb": {y: f"rgb_{y}.webp" for y in years},
        "geotiff": {y: f"classes_{y}.tif" for y in years},
        "map_png": {y: f"map_{y}.png" for y in years},
        "patches_geojson": "patches.geojson",
        "patches_csv": "patches.csv",
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def build_city(city, cfg, calibration):
    """Composites, RGB and patches (with data in both years) for one city."""
    city_cfg = {**city, "max_cloud": cfg["max_cloud"]}
    built, all_grids = {}, {}
    for year, window in cfg["years"].items():
        composite, has_data, grids, info = build_year(year, window, city_cfg)
        built[year] = {"composite": composite, "has_data": has_data, "scenes": info}
        all_grids.update(grids)
    check_same_grid(all_grids)
    crs, grid_numbers, shape = next(iter(all_grids.values()))
    years = list(cfg["years"])
    both = built[years[0]]["has_data"] & built[years[1]]["has_data"]
    patches = {}
    for year in years:
        built[year]["rgb"] = values_to_rgb(built[year]["composite"], calibration, cfg["scale_max"])
        patches[year] = cut_patches(built[year]["rgb"], both, cfg["patch_size"])
    return built, crs, Affine(*grid_numbers), shape, patches


def check_against_47(table, csv_path, seed, years):
    """How many patches get a different class from ONNX than from step 4.7's PyTorch run."""
    old = pd.read_csv(csv_path)
    merged = table.merge(old, on=["row", "col"], how="outer", indicator=True)
    both = merged[merged["_merge"] == "both"]
    result = {"patches_here": len(table), "patches_in_4_7": len(old), "matched": len(both)}
    for y in years:
        differs = both[f"class_{y}"] != both[f"pred_{y}_seed{seed}"]
        result[f"different_class_{y}"] = int(differs.sum())
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--city", help="only this city id (default: all)")
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    calibration = json.loads(Path(cfg["calibration_path"]).read_text(encoding="utf-8"))
    change_cfg = yaml.safe_load(Path(cfg["change_config"]).read_text(encoding="utf-8"))
    colours = change_cfg["class_colours"]
    eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))
    india_cfg = yaml.safe_load(Path(cfg["india_config"]).read_text(encoding="utf-8"))
    finetune_boxes = [a["bbox"] for a in india_cfg["areas"]
                      if a["name"] in eval_cfg["finetune_areas"]]
    session, info = load_model(cfg["onnx_path"], cfg["onnx_info_path"])
    assert info["classes"] == CLASSES, "model classes differ from src/data.py CLASSES"
    out_root = Path(cfg["out_dir"])
    years = list(cfg["years"])

    results_path = Path(cfg["results_path"])
    results = json.loads(results_path.read_text(encoding="utf-8")) if results_path.exists() else {}
    results.setdefault("cities", {})
    for city in cfg["cities"]:
        if args.city and city["id"] != args.city:
            continue
        print(f"== {city['name']}", flush=True)
        built, crs, grid_transform, shape, patches = build_city(city, cfg, calibration)
        rows = [r for r, _, _ in patches[years[0]]]
        cols = [c for _, c, _ in patches[years[0]]]
        preds = {}
        for y in years:
            images = np.stack([p for _, _, p in patches[y]])
            preds[y] = predict(session, info, images, cfg["batch_size"])
        summary = write_city(out_root / city["id"], city, cfg, built, crs, grid_transform, shape,
                             preds, rows, cols, finetune_boxes, colours)
        entry = {k: summary[k] for k in ["n_patches", "n_patches_touching_finetune_area",
                                         "changed_patches", "changed_km2", "areas_km2",
                                         "mean_confidence"]}
        entry["n_scenes"] = {y: summary["years"][y]["n_scenes"] for y in years}
        if city["id"] == cfg["check_city"]:
            table = pd.read_csv(out_root / city["id"] / "patches.csv")
            entry["check_vs_step_4_7"] = check_against_47(
                table, cfg["check_patches_csv"], cfg["check_seed"], years)
            print("check vs 4.7:", entry["check_vs_step_4_7"], flush=True)
        results["cities"][city["id"]] = entry
        print(f"{city['name']}: {summary['n_patches']} patches, "
              f"{summary['changed_patches']} changed class", flush=True)

    results["model"] = {"onnx_path": cfg["onnx_path"], "seed": 42}
    results["years"] = cfg["years"]
    results_path.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    index = {
        "years": years,
        "classes": [{"name": c, "colour": colours[c]} for c in CLASSES],
        "cities": [
            {"id": c["id"], "name": c["name"], "bbox": c["bbox"],
             "summary": f"{c['id']}/summary.json"}
            for c in cfg["cities"] if (out_root / c["id"] / "summary.json").exists()
        ],
        "model": "TerraScan fine-tuned EfficientNet-B0, seed 42 (ONNX)",
    }
    (out_root / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
