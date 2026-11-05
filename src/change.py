"""Step 4.7: land-use maps of the Ahmedabad box for two years, and what changed between them.

For each year (configs/change.yaml):
  1. All clear scenes of one tile in the dry-season window, one copy per date (one_per_date).
  2. Read the box from each scene; remove the +1000 offset per scene, BEFORE the median.
  3. Per pixel, the median over the scenes (median_composite): clouds and shadows that show up
     on only a few days drop out.
  4. Every scene (both years) must sit on the same pixel grid (check_same_grid), so patch N is
     the same piece of ground in both years.
Then: EuroSAT-style RGB (same calibration as 4.2), 64x64 patches with data in both years, the
fine-tuned model (4.4) for each seed, area per class and a from -> to change matrix.

Run from the repo root: python -m src.change --config configs/change.yaml
"""

import argparse
import json
import statistics
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save to files, no window
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
import yaml  # noqa: E402
from affine import Affine  # noqa: E402  (rasterio's map-grid type)
from PIL import Image  # noqa: E402
from rasterio.transform import xy  # noqa: E402
from rasterio.warp import transform  # noqa: E402
from shapely.geometry import Polygon, box  # noqa: E402

from src.composite import (  # noqa: E402
    build_year,
    change_matrix,
    check_same_grid,
    patch_km2,
    save_class_map,
)
from src.data import CLASSES, build_transforms  # noqa: E402
from src.evaluate import load_run  # noqa: E402
from src.imagery import cut_patches, patch_centre_lonlat, values_to_rgb  # noqa: E402


def patch_footprint_lonlat(grid_transform, crs, row, col, size):
    """The patch's outline in lon/lat (a 4-corner polygon), to test overlap with lon/lat boxes."""
    corners = [(row, col), (row, col + size), (row + size, col + size), (row + size, col)]
    xs, ys = zip(*[xy(grid_transform, r, c, offset="ul") for r, c in corners])
    lons, lats = transform(crs, "EPSG:4326", list(xs), list(ys))
    return Polygon(zip(lons, lats))


def summarise_seed(before, after, km2_per_patch, outside, years):
    """Areas per class (both years) and the change matrix, for one seed's predictions.

    before/after: class numbers per patch (numpy arrays). outside: True for patches NOT touching a
    fine-tune area. years: the two year names, e.g. ("2018", "2026").
    """
    matrix = change_matrix(before, after, len(CLASSES))
    matrix_out = change_matrix(before[outside], after[outside], len(CLASSES))
    result = {"patch_counts": {}, "areas_km2": {}}
    for year, preds in zip(years, [before, after]):
        counts = np.bincount(preds, minlength=len(CLASSES))
        result["patch_counts"][year] = dict(zip(CLASSES, counts.tolist()))
        areas = {c: round(n * km2_per_patch, 4) for c, n in zip(CLASSES, counts)}
        result["areas_km2"][year] = areas
    changed = int(matrix.sum() - np.trace(matrix))
    changed_out = int(matrix_out.sum() - np.trace(matrix_out))
    result.update({
        "change_matrix": matrix.tolist(),
        "changed_patches": changed,
        "changed_km2": round(changed * km2_per_patch, 4),
        "change_matrix_outside_finetune": matrix_out.tolist(),
        "changed_patches_outside_finetune": changed_out,
        "changed_km2_outside_finetune": round(changed_out * km2_per_patch, 4),
    })
    return result


def mean_std(values):
    """[mean, sample std] rounded, like the rest of the project's 3-seed results."""
    return [round(statistics.mean(values), 4), round(statistics.stdev(values), 4)]


@torch.no_grad()
def predict_rgb(model, run_cfg, patches, device, batch_size):
    """Predicted class number for each (H, W, 3) uint8 patch, scaled exactly as in training."""
    stats = run_cfg.get("norm_stats") or json.loads(
        Path(run_cfg["data"]["stats_path"]).read_text(encoding="utf-8")
    )
    tf = build_transforms(stats, False, run_cfg.get("image_size", 64), run_cfg.get("target_stats"))
    model.to(device).eval()
    preds = []
    for start in range(0, len(patches), batch_size):
        # same as read_image: (3, H, W) floats in 0-1
        batch = [torch.from_numpy(p).permute(2, 0, 1).float() / 255
                 for p in patches[start:start + batch_size]]
        images = torch.stack([tf(image) for image in batch])
        preds.append(model(images.to(device)).argmax(dim=1).cpu())
    return torch.cat(preds).numpy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    calibration = json.loads(Path(cfg["calibration_path"]).read_text(encoding="utf-8"))
    size, years = cfg["patch_size"], list(cfg["years"])
    assert len(years) == 2, "exactly two years"

    # 1. One composite per year; every scene of both years must share one pixel grid.
    built, all_grids = {}, {}
    for year in years:
        composite, has_data, grids, info = build_year(year, cfg["years"][year], cfg)
        built[year] = {"composite": composite, "has_data": has_data, "scenes": info}
        all_grids.update(grids)
    check_same_grid(all_grids)
    crs, grid_numbers, shape = next(iter(all_grids.values()))
    grid_transform = Affine(*grid_numbers)
    km2_per_patch = patch_km2(grid_transform, size)

    # 2. EuroSAT-style RGB, patches with data in BOTH years (same rows/cols in both years).
    both = built[years[0]]["has_data"] & built[years[1]]["has_data"]
    patches = {}
    for year in years:
        rgb = values_to_rgb(built[year]["composite"], calibration, cfg["scale_max"])
        Image.fromarray(rgb).save(Path(cfg["cache_dir"]) / f"rgb_{year}.png")  # for step 4.8
        built[year]["rgb"] = rgb
        patches[year] = cut_patches(rgb, both, size)
    rows = [r for r, _, _ in patches[years[0]]]
    cols = [c for _, c, _ in patches[years[0]]]
    assert rows == [r for r, _, _ in patches[years[1]]]
    assert cols == [c for _, c, _ in patches[years[1]]]

    # 3. Which patches touch an area the model was fine-tuned on (bias check).
    eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))
    india_cfg = yaml.safe_load(Path(cfg["india_config"]).read_text(encoding="utf-8"))
    ft_boxes = [
        box(*a["bbox"]) for a in india_cfg["areas"] if a["name"] in eval_cfg["finetune_areas"]
    ]
    table = pd.DataFrame({"row": rows, "col": cols})
    centres = [patch_centre_lonlat(grid_transform, crs, r, c, size) for r, c in zip(rows, cols)]
    table["lon"] = [round(lon, 6) for lon, _ in centres]
    table["lat"] = [round(lat, 6) for _, lat in centres]
    table["touches_finetune_area"] = [
        any(patch_footprint_lonlat(grid_transform, crs, r, c, size).intersects(b) for b in ft_boxes)
        for r, c in zip(rows, cols)
    ]
    outside = ~table["touches_finetune_area"].to_numpy()

    # 4. Predict both years with every seed.
    device = "cuda" if torch.cuda.is_available() else "cpu"
    per_seed = {}
    for seed in cfg["seeds"]:
        model, run_cfg = load_run(Path(cfg["model_dir"]) / f"seed{seed}")
        preds = {}
        for year in years:
            year_patches = [p for _, _, p in patches[year]]
            preds[year] = predict_rgb(model, run_cfg, year_patches, device, cfg["batch_size"])
            table[f"pred_{year}_seed{seed}"] = [CLASSES[k] for k in preds[year]]
        per_seed[str(seed)] = summarise_seed(
            preds[years[0]], preds[years[1]], km2_per_patch, outside, years
        )
        if seed == cfg["map_seed"]:
            for year in years:
                info = built[year]["scenes"]
                title = (
                    f"{year}: predicted class per 640 m patch "
                    f"(fine-tuned EfficientNet-B0, seed {seed})\n"
                    f"median of {len(info)} scenes, {info[0]['date']} to {info[-1]['date']}"
                )
                save_class_map(rows, cols, preds[year], shape, size, cfg["class_colours"], title,
                               cfg["map_figure"].format(year=year))
        changed = per_seed[str(seed)]["changed_patches"]
        print(f"seed {seed}: {changed} of {len(rows)} patches changed class", flush=True)

    # 5. Composites side by side, to check by eye (every 4th pixel keeps the file small).
    fig, axes = plt.subplots(1, 2, figsize=(14, 7))
    for ax, year in zip(axes, years):
        ax.imshow(built[year]["rgb"][::4, ::4])
        ax.set_title(f"{year} composite ({cfg['years'][year]})")
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(cfg["composites_figure"], dpi=110)
    plt.close(fig)

    # 6. Save.
    seeds = [str(s) for s in cfg["seeds"]]
    summary = {
        "areas_km2": {
            year: {c: mean_std([per_seed[s]["areas_km2"][year][c] for s in seeds]) for c in CLASSES}
            for year in years
        },
        "changed_km2": mean_std([per_seed[s]["changed_km2"] for s in seeds]),
        "changed_km2_outside_finetune": mean_std(
            [per_seed[s]["changed_km2_outside_finetune"] for s in seeds]
        ),
    }
    years_out = {}
    for year in years:
        composite, rgb = built[year]["composite"], built[year]["rgb"]
        years_out[year] = {
            "window": cfg["years"][year],
            "n_scenes": len(built[year]["scenes"]),
            "scenes": built[year]["scenes"],
            # colour check: different processing baselines could shift colours between years
            "median_offset_free_values_rgb": [
                float(np.median(composite[..., k][both])) for k in range(3)
            ],
            "median_rgb_0_255": [float(np.median(rgb[..., k][both])) for k in range(3)],
        }
    result = {
        "bbox": cfg["bbox"],
        "tile": cfg["tile"],
        "years": years_out,
        "grid": {
            "crs": crs, "transform": list(grid_numbers), "height": shape[0], "width": shape[1]
        },
        "patch_size": size,
        "km2_per_patch": round(km2_per_patch, 6),
        "n_patches": len(rows),
        "n_patches_outside_finetune": int(outside.sum()),
        "classes": CLASSES,
        "change_matrix_note": f"rows = class in {years[0]}, columns = class in {years[1]}",
        "model_dir": cfg["model_dir"],
        "map_seed": cfg["map_seed"],
        "per_seed": per_seed,
        "mean_std_over_seeds": summary,
    }
    Path(cfg["output_path"]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    table.to_csv(cfg["patches_csv"], index=False)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
