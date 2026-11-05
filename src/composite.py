"""Torch-free helpers shared by step 4.7 (src/change.py), 5.2a (src/showcase.py) and the API (5.2b).

Moved here unchanged from src/change.py in step 5.2b, so the API container does not need PyTorch.
  one_per_date / build_year: all clear scenes of one tile in a window, one per date, then a
    per-pixel median (median_composite). The +1000 offset is removed per scene, before the median.
  check_same_grid: every scene must sit on the same pixel grid, so patch N is the same ground.
  change_matrix, patch_km2, save_class_map: counting, area and a readable map picture.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save to files, no window
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402

from src.classes import CLASSES  # noqa: E402
from src.imagery import box_grid, box_to_values, needs_offset_fix, search_scenes  # noqa: E402


def one_per_date(items):
    """Keep one scene per date: the newest processing (latest s2:generation_time).

    The same picture can exist as an older and a re-processed copy (step 4.6). Sorted by date.
    """
    best = {}
    for item in items:
        date = item.properties["datetime"][:10]
        newer = item.properties["s2:generation_time"]
        if date not in best or newer > best[date].properties["s2:generation_time"]:
            best[date] = item
    return [best[date] for date in sorted(best)]


def check_same_grid(grids):
    """Stop unless every (crs, transform, shape) is identical. grids: dict name -> grid."""
    first_name, first = next(iter(grids.items()))
    for name, grid in grids.items():
        if grid != first:
            raise ValueError(f"{name} is on a different grid than {first_name}: {grid} vs {first}")


def median_composite(values_list, has_data_list, rows_per_chunk=256):
    """Per-pixel median over scenes, ignoring each scene's no-data pixels.

    values_list: (H, W, 3) offset-free values, one per scene. Returns (H, W, 3) float32 and a
    mask of pixels with data in at least one scene. Done in strips of rows to save memory.
    """
    height, width, _ = values_list[0].shape
    out = np.full((height, width, 3), np.nan, dtype=np.float32)
    for top in range(0, height, rows_per_chunk):
        rows = slice(top, top + rows_per_chunk)
        stack = np.stack([v[rows].astype(np.float32) for v in values_list])  # (N, h, W, 3)
        mask = np.stack([m[rows] for m in has_data_list])                    # (N, h, W)
        stack[~mask] = np.nan
        valid = mask.any(axis=0)
        out[rows][valid] = np.nanmedian(stack[:, valid], axis=0)
    has_data = ~np.isnan(out).any(axis=-1)
    return np.nan_to_num(out), has_data


def change_matrix(before, after, n_classes):
    """Counts: row = class in the first year, column = class in the second year."""
    matrix = np.zeros((n_classes, n_classes), dtype=int)
    np.add.at(matrix, (np.asarray(before), np.asarray(after)), 1)
    return matrix


def patch_km2(grid_transform, size):
    """Ground area of one size x size patch in km2, from the pixel size of the grid."""
    return abs(grid_transform.a * grid_transform.e) * size * size / 1e6


def read_scene(item, bbox, cache_dir):
    """Offset-free values, data mask and grid of the box in one scene (cached on disk)."""
    cache = Path(cache_dir) / f"{item.id}.npz"
    if not cache.exists():
        values, has_data = box_to_values(item, bbox)
        crs, grid = box_grid(item, bbox)
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            cache, values=values.astype(np.uint16), has_data=has_data, crs=crs,
            grid=np.array(grid)[:6],
        )
    saved = np.load(cache)
    grid = (str(saved["crs"]), tuple(float(v) for v in saved["grid"]), saved["values"].shape[:2])
    return saved["values"], saved["has_data"], grid


def build_year(year, window, cfg):
    """Median composite of all clear scenes of the chosen tile in the window, one per date."""
    found = search_scenes(cfg["bbox"], window, cfg["max_cloud"])
    scenes = one_per_date([s for s in found if s.properties["s2:mgrs_tile"] == cfg["tile"]])
    if not scenes:
        raise SystemExit(f"{year}: no clear scene of tile {cfg['tile']} in {window}")
    values_list, masks, grids, info = [], [], {}, []
    for i, scene in enumerate(scenes, 1):
        print(f"{year}: reading scene {i}/{len(scenes)} {scene.id}", flush=True)
        values, has_data, grid = read_scene(scene, cfg["bbox"], cfg["cache_dir"])
        values_list.append(values)
        masks.append(has_data)
        grids[scene.id] = grid
        info.append({
            "id": scene.id,
            "date": scene.properties["datetime"][:10],
            "cloud": round(scene.properties["eo:cloud_cover"], 2),
            "baseline": scene.properties["s2:processing_baseline"],
            "offset_removed": needs_offset_fix(scene),
            "no_data_pixels": int((~has_data).sum()),
        })
    print(f"{year}: median of {len(scenes)} scenes", flush=True)
    composite, has_data = median_composite(values_list, masks)
    return composite, has_data, grids, info


def save_class_map(rows, cols, preds, shape, size, colours, title, path):
    """Colour each patch by its predicted class; white where there is no patch."""
    grid = np.full((shape[0] // size, shape[1] // size, 3), 1.0)
    rgb = np.array([matplotlib.colors.to_rgb(colours[c]) for c in CLASSES])
    grid[np.asarray(rows) // size, np.asarray(cols) // size] = rgb[preds]
    fig, ax = plt.subplots(figsize=(9, 8))
    ax.imshow(grid, interpolation="nearest")
    ax.set_title(title, fontsize=10)
    ax.axis("off")
    handles = [Patch(color=colours[c], label=c) for c in CLASSES]
    ax.legend(handles=handles, loc="center left", bbox_to_anchor=(1.01, 0.5), fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
