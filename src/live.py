"""Step 5.2b: "map your own area". One drawn box, one year, mapped live for the API (api/main.py).

Same recipe as the showcase maps (src/showcase.py), with two differences so it fits in 60 seconds:
  - only the max_scenes clearest scenes of one tile are used for the median (showcase: all of them);
  - nothing is cached on disk, and the files come back inside the answer as data URLs
    ("data:image/png;base64,..."), which a browser can show or download directly.
No PyTorch is imported here (or by anything this imports), so the API container stays small.
"""

import base64
import json
import math
import tempfile
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

from src.classes import CLASSES
from src.composite import check_same_grid, median_composite, one_per_date, patch_km2
from src.imagery import box_grid, box_to_values, cut_patches, search_scenes, values_to_rgb
from src.onnx_predict import load_model, predict
from src.showcase import (
    class_grid,
    grid_corners,
    overlay_rgba,
    patch_table,
    patches_geojson,
    write_geotiff,
)

KM_PER_DEGREE = 111.32  # one degree of latitude; one degree of longitude is this x cos(latitude)


class BoxError(ValueError):
    """The request can't be mapped (box too big, wrong year, no clear scene). Shown to the user."""


def box_size_km(bbox):
    """Width and height of [west, south, east, north] in km (close enough for a 10 km limit)."""
    west, south, east, north = bbox
    middle_lat = math.radians((south + north) / 2)
    return (east - west) * KM_PER_DEGREE * math.cos(middle_lat), (north - south) * KM_PER_DEGREE


def check_request(bbox, year, cfg):
    """Raise BoxError with a plain message unless the box and year can be mapped."""
    if year not in cfg["years"]:
        raise BoxError(f"Year must be one of {', '.join(cfg['years'])}.")
    if len(bbox) != 4:
        raise BoxError("The box must be 4 numbers: west, south, east, north (degrees).")
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise BoxError("The box must have west < east and south < north, in degrees.")
    width, height = box_size_km(bbox)
    limit = cfg["max_side_km"]
    if width > limit or height > limit:
        raise BoxError(f"The box is {width:.1f} x {height:.1f} km. Please draw at most "
                       f"{limit} x {limit} km.")
    patch_km = cfg["patch_size"] * 10 / 1000  # 10 m pixels
    if width < patch_km or height < patch_km:
        raise BoxError(f"The box is {width:.2f} x {height:.2f} km. It must be at least "
                       f"{patch_km} x {patch_km} km (one patch).")


def pick_scenes(items, max_scenes):
    """The tile with the most clear dates, and its max_scenes clearest scenes (sorted by date).

    Only one tile, so every scene sits on the same pixel grid (one per date, as in step 4.7).
    """
    by_tile = {}
    for item in items:
        by_tile.setdefault(item.properties["s2:mgrs_tile"], []).append(item)
    tile = max(sorted(by_tile), key=lambda t: len(one_per_date(by_tile[t])))
    clearest = sorted(one_per_date(by_tile[tile]),
                      key=lambda s: s.properties["eo:cloud_cover"])[:max_scenes]
    return tile, sorted(clearest, key=lambda s: s.properties["datetime"])


def fetch_composite(bbox, window, cfg):
    """Read the box from the clearest scenes and take the per-pixel median (network)."""
    found = search_scenes(bbox, window, cfg["max_cloud"])
    if not found:
        raise BoxError(f"No clear Sentinel-2 picture covers this whole box in {window}. "
                       "Try a box a little to the side.")
    tile, scenes = pick_scenes(found, cfg["max_scenes"])
    values_list, masks, grids = [], [], {}
    for scene in scenes:
        values, has_data = box_to_values(scene, bbox)  # +1000 offset removed per scene
        crs, grid_transform = box_grid(scene, bbox)
        values_list.append(values)
        masks.append(has_data)
        grids[scene.id] = (crs, tuple(grid_transform)[:6], values.shape[:2])
    check_same_grid(grids)
    composite, has_data = median_composite(values_list, masks)
    info = [{"id": s.id, "date": s.properties["datetime"][:10],
             "cloud": round(s.properties["eo:cloud_cover"], 2)} for s in scenes]
    return composite, has_data, crs, grid_transform, tile, info


def data_url(data, media_type):
    return f"data:{media_type};base64," + base64.b64encode(data).decode("ascii")


def image_data_url(array, fmt, media_type, **save_args):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"image.{fmt}"
        Image.fromarray(array).save(path, **save_args)
        return data_url(path.read_bytes(), media_type)


def geotiff_data_url(grid, grid_transform, crs, size, colours):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "classes.tif"
        write_geotiff(path, grid, grid_transform, crs, size, colours)
        return data_url(path.read_bytes(), "image/tiff")


def load_context(config_path):
    """Everything a request needs, loaded once when the API starts (model, colours, ...)."""
    cfg = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
    eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))
    india_cfg = yaml.safe_load(Path(cfg["india_config"]).read_text(encoding="utf-8"))
    session, info = load_model(cfg["onnx_path"], cfg["onnx_info_path"])
    assert info["classes"] == CLASSES, "model classes differ from src/classes.py"
    return {
        "cfg": cfg,
        "calibration": json.loads(Path(cfg["calibration_path"]).read_text(encoding="utf-8")),
        "colours": yaml.safe_load(
            Path(cfg["change_config"]).read_text(encoding="utf-8"))["class_colours"],
        "finetune_boxes": [a["bbox"] for a in india_cfg["areas"]
                           if a["name"] in eval_cfg["finetune_areas"]],
        "session": session,
        "info": info,
    }


def map_box(bbox, year, ctx):
    """Land-use map of one box for one year, in the same format as a showcase summary.json.

    Differences from summary.json: one year only (so no change table), the patches GeoJSON is
    included, and "files" holds data URLs instead of file names.
    """
    cfg, size = ctx["cfg"], ctx["cfg"]["patch_size"]
    check_request(bbox, year, cfg)
    window = cfg["years"][year]
    composite, has_data, crs, grid_transform, tile, scenes = fetch_composite(bbox, window, cfg)
    rgb = values_to_rgb(composite, ctx["calibration"], cfg["scale_max"])
    patches = cut_patches(rgb, has_data, size)
    if not patches:
        raise BoxError("The pictures have gaps everywhere in this box. Try a box a little "
                       "to the side.")
    rows = [r for r, _, _ in patches]
    cols = [c for _, c, _ in patches]
    preds = {year: predict(ctx["session"], ctx["info"], np.stack([p for _, _, p in patches]),
                           cfg["batch_size"])}
    classes, confidence = preds[year]

    grid = class_grid(rows, cols, classes, has_data.shape, size)
    h, w = grid.shape[0] * size, grid.shape[1] * size
    small_rgb = np.asarray(Image.fromarray(rgb[:h, :w]).reduce(cfg["rgb_downscale"]))
    table, outlines = patch_table(rows, cols, preds, [year], grid_transform, crs, size,
                                  ctx["finetune_boxes"])
    km2 = patch_km2(grid_transform, size)
    counts = np.bincount(classes, minlength=len(CLASSES))
    return {
        "bbox": list(bbox),
        "tile": tile,
        "years": {year: {"window": window, "n_scenes": len(scenes),
                         "first_date": scenes[0]["date"], "last_date": scenes[-1]["date"],
                         "scenes": [s["id"] for s in scenes]}},
        "scene_note": f"median of the {cfg['max_scenes']} clearest scenes at most "
                      "(the showcase cities use every clear scene)",
        "overlay_corners": grid_corners(grid_transform, crs, grid.shape, size),
        "grid_rows": int(grid.shape[0]),
        "grid_cols": int(grid.shape[1]),
        "km2_per_patch": round(km2, 6),
        "n_patches": len(rows),
        "n_patches_touching_finetune_area": int(table["touches_finetune_area"].sum()),
        "patch_counts": {year: dict(zip(CLASSES, counts.tolist()))},
        "areas_km2": {year: {c: round(int(n) * km2, 4) for c, n in zip(CLASSES, counts)}},
        "mean_confidence": {year: round(float(confidence.mean()), 4)},
        "patches_geojson": patches_geojson(table, outlines, [year]),
        "files": {
            "overlay": {year: image_data_url(overlay_rgba(grid, ctx["colours"]), "png",
                                             "image/png")},
            "rgb": {year: image_data_url(small_rgb, "webp", "image/webp",
                                         quality=cfg["rgb_webp_quality"])},
            "geotiff": {year: geotiff_data_url(grid, grid_transform, crs, size,
                                               ctx["colours"])},
        },
    }
