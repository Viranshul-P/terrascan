"""Step 4.2: cut Indian Sentinel-2 areas into 64x64 patches for labelling.

1. For each area in the config: find the clearest scene, read the box (offset removed per scene),
   cached in imagery/india_<area>.npz.
2. Turn it into EuroSAT-style RGB with 4.1's colour calibration (results/imagery_calibration.json).
3. Cut 64x64 patches, save each as a PNG in data/india/patches/, and list them in
   data/india/patches.csv (file, area, lat, lon of the patch centre, row, col, scene).
4. Save results/india_patches.json (patches per area, scene used) and
   reports/figures/india_areas.png: every whole area, to check by eye that the boxes are right.

Run from the repo root: python scripts/india_patches.py --config configs/india.yaml
"""

import argparse
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save to files, no window
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import yaml  # noqa: E402
from affine import Affine  # noqa: E402  (rasterio's map-grid type, installed with rasterio)
from PIL import Image  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.imagery import (  # noqa: E402
    box_grid,
    box_to_values,
    cut_patches,
    needs_offset_fix,
    patch_centre_lonlat,
    search_scenes,
    values_to_rgb,
)


def load_area(area, cfg):
    """Offset-free values, data mask, map grid and scene info for one area (cached)."""
    cache = Path(cfg["cache_dir"]) / f"india_{area['name']}.npz"
    if not cache.exists():
        scenes = search_scenes(area["bbox"], area["dates"], cfg["max_cloud"])
        if not scenes:
            raise SystemExit(f"No scene with < {cfg['max_cloud']}% cloud covers {area['name']}")
        scene = scenes[0]
        values, has_data = box_to_values(scene, area["bbox"])
        crs, grid = box_grid(scene, area["bbox"])
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            cache,
            values=values.astype(np.uint16),
            has_data=has_data,
            crs=crs,
            grid=np.array(grid)[:6],  # affine numbers a, b, c, d, e, f
            scene_id=scene.id,
            date=scene.properties["datetime"],
            cloud=scene.properties["eo:cloud_cover"],
            baseline=scene.properties["s2:processing_baseline"],
            offset_fixed=needs_offset_fix(scene),
        )
    return np.load(cache)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    calibration = json.loads(Path(cfg["calibration_path"]).read_text(encoding="utf-8"))
    size = cfg["patch_size"]

    patches_dir = Path(cfg["patches_dir"])
    patches_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    whole_areas = []
    for area in cfg["areas"]:
        saved = load_area(area, cfg)
        grid = Affine(*saved["grid"])
        crs = str(saved["crs"])
        rgb = values_to_rgb(saved["values"], calibration, cfg["scale_max"])
        whole_areas.append((area["name"], rgb, str(saved["date"])[:10]))
        cut = cut_patches(rgb, saved["has_data"], size)
        for row, col, patch in cut:
            file = f"{area['name']}_r{row:04d}_c{col:04d}.png"
            Image.fromarray(patch).save(patches_dir / file)
            lon, lat = patch_centre_lonlat(grid, crs, row, col, size)
            rows.append({
                "file": file,
                "area": area["name"],
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "row": row,
                "col": col,
                "scene_id": str(saved["scene_id"]),
                "date": str(saved["date"])[:10],
                "scene_cloud_percent": float(saved["cloud"]),
                "processing_baseline": str(saved["baseline"]),
                "offset_removed": bool(saved["offset_fixed"]),
            })
        print(f"{area['name']}: {len(cut)} patches, scene {saved['scene_id']}, "
              f"cloud {float(saved['cloud']):.2f}%, baseline {saved['baseline']}")

    table = pd.DataFrame(rows)
    table.to_csv(cfg["patches_csv"], index=False)
    print(f"{len(table)} patches -> {cfg['patches_csv']}")

    summary = {"total_patches": len(table), "areas": {}}
    for name, group in table.groupby("area", sort=False):
        first = group.iloc[0]
        summary["areas"][name] = {
            "patches": len(group),
            "scene_id": first["scene_id"],
            "date": first["date"],
            "scene_cloud_percent": first["scene_cloud_percent"],
            "processing_baseline": first["processing_baseline"],
            "offset_removed": bool(first["offset_removed"]),
        }
    Path(cfg["summary_path"]).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"summary -> {cfg['summary_path']}")

    fig, axes = plt.subplots(1, len(whole_areas), figsize=(4 * len(whole_areas), 4.6))
    for ax, (name, rgb, date) in zip(axes, whole_areas):
        ax.imshow(rgb)
        ax.set_title(f"{name}\n{date}", fontsize=10)
        ax.axis("off")
    fig.suptitle("Indian areas cut into 64x64 patches for labelling (calibrated, EuroSAT stretch)")
    fig.tight_layout(rect=(0, 0, 1, 0.93))  # leave room for the main title
    fig.savefig(cfg["areas_figure_path"], dpi=110)
    print(f"figure -> {cfg['areas_figure_path']}")


if __name__ == "__main__":
    main()
