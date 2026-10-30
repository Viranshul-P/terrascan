"""Step 4.1: do our Sentinel-2 patches look like EuroSAT?

1. Reads every area in the config (offset removed per scene), cached in imagery/.
2. Fits the colour calibration on the "fit" areas only -> results/imagery_calibration.json.
3. Saves reports/figures/imagery_vs_eurosat.png: EuroSAT train images vs the held-out European
   check area and Ahmedabad, each without and with calibration, plus colour histograms.
4. Saves reports/figures/munich_check_predictions.png: the best model on check-area patches.
5. Saves results/imagery_check.json: per-colour mean/std, scenes used, prediction counts.

Run from the repo root: python scripts/imagery_check.py --config configs/imagery.yaml
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
import torch  # noqa: E402
import yaml  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import CLASSES, build_transforms, read_image  # noqa: E402
from src.evaluate import load_run  # noqa: E402
from src.imagery import (  # noqa: E402
    box_to_values,
    cut_patches,
    eurosat_to_dn,
    fit_calibration,
    needs_offset_fix,
    search_scenes,
    values_to_rgb,
)

COLOURS = ["red", "green", "blue"]
NO_CALIBRATION = {"gain": [1.0, 1.0, 1.0], "shift": [0.0, 0.0, 0.0]}


def load_area(area, cfg):
    """Offset-free values (H, W, 3) from the area's clearest scene, or from the cache."""
    cache = Path(cfg["cache_dir"]) / f"{area['name']}.npz"
    if not cache.exists():
        scenes = search_scenes(area["bbox"], area["dates"], cfg["max_cloud"])
        if not scenes:
            raise SystemExit(f"No scene with < {cfg['max_cloud']}% cloud covers {area['name']}")
        scene = scenes[0]
        values, has_data = box_to_values(scene, area["bbox"])
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            cache,
            values=values.astype(np.uint16),
            has_data=has_data,
            scene_id=scene.id,
            date=scene.properties["datetime"],
            cloud=scene.properties["eo:cloud_cover"],
            baseline=scene.properties["s2:processing_baseline"],
            offset_fixed=needs_offset_fix(scene),
        )
    saved = np.load(cache)
    info = {
        "scene_id": str(saved["scene_id"]),
        "date": str(saved["date"]),
        "scene_cloud_percent": float(saved["cloud"]),
        "processing_baseline": str(saved["baseline"]),
        "offset_removed": bool(saved["offset_fixed"]),
    }
    cut = cut_patches(saved["values"], saved["has_data"], cfg["patch_size"])
    return np.stack([p for _, _, p in cut]), info


def colour_stats(images):
    """Mean and std of each colour (values 0-1) over a stack of uint8 images (N, H, W, 3)."""
    pixels = images.reshape(-1, 3) / 255
    return {
        "mean": pixels.mean(axis=0).round(4).tolist(),
        "std": pixels.std(axis=0).round(4).tolist(),
    }


def mosaic(images, per_row=4, gap=2):
    """Put uint8 images (N, H, W, 3) into one grid image with white gaps."""
    size = images.shape[1]
    rows = int(np.ceil(len(images) / per_row))
    out = np.full((rows * (size + gap) - gap, per_row * (size + gap) - gap, 3), 255, np.uint8)
    for i, image in enumerate(images):
        top, left = (k * (size + gap) for k in divmod(i, per_row))
        out[top:top + size, left:left + size] = image
    return out


def save_comparison(sources, path):
    """sources: list of (label, shown images, all images, line style).

    Mosaics on top, one colour histogram per channel below.
    """
    fig = plt.figure(figsize=(4 * len(sources), 9.5))
    for i, (label, shown, _, _) in enumerate(sources):
        ax = fig.add_subplot(2, len(sources), i + 1)
        ax.imshow(mosaic(shown))
        ax.set_title(label, fontsize=10)
        ax.axis("off")
    bins = np.arange(257)
    for k, colour in enumerate(COLOURS):
        ax = fig.add_subplot(2, 3, 4 + k)
        for label, _, everything, style in sources:
            counts, _ = np.histogram(everything[..., k], bins=bins, density=True)
            ax.plot(bins[:-1], counts, style, label=label.replace("\n", " "), linewidth=1.2)
        ax.set_title(f"{colour} channel")
        ax.set_xlabel("pixel value (0-255)")
        ax.set_xlim(0, 255)
        if k == 0:
            ax.set_ylabel("share of pixels")
            ax.legend(fontsize=7)
    fig.suptitle("Do our Sentinel-2 L2A patches look like EuroSAT? Calibration fitted on "
                 "Lyon, Poznan, Utrecht only (Munich and Ahmedabad not used)")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=110)
    plt.close(fig)


@torch.no_grad()
def predict_patches(run_dir, patches):
    """Best model's predicted class and confidence for uint8 patches (N, 64, 64, 3)."""
    model, run_cfg = load_run(run_dir)
    stats = run_cfg.get("norm_stats") or json.loads(Path(run_cfg["data"]["stats_path"]).read_text())
    transform = build_transforms(
        stats, train=False, image_size=run_cfg.get("image_size", 64),
        target_stats=run_cfg.get("target_stats"),
    )
    images = torch.from_numpy(patches).permute(0, 3, 1, 2).float() / 255  # same 0-1 as read_image
    inputs = torch.stack([transform(image) for image in images])
    conf, pred = model(inputs).softmax(dim=1).max(dim=1)
    return pred.numpy(), conf.numpy()


def save_predictions(patches, plain, calibrated, title, path):
    """patches shown calibrated; caption: prediction without -> with calibration."""
    fig, axes = plt.subplots(4, 4, figsize=(10, 11))
    for ax, patch, (p0, c0), (p1, c1) in zip(axes.flat, patches, zip(*plain), zip(*calibrated)):
        ax.imshow(patch)
        caption = f"plain: {CLASSES[p0]} ({c0:.2f})\ncalib.: {CLASSES[p1]} ({c1:.2f})"
        ax.set_title(caption, fontsize=8)
        ax.axis("off")
    fig.suptitle(title, fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def class_counts(preds):
    return {CLASSES[c]: int((preds == c).sum()) for c in range(len(CLASSES))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    rng = np.random.default_rng(cfg["seed"])
    scale_max = cfg["scale_max"]

    # EuroSAT: random TRAIN images only (never test).
    data_cfg = yaml.safe_load(open("configs/data.yaml", encoding="utf-8"))
    train = pd.read_csv(Path(data_cfg["splits_dir"]) / "train.csv")
    picks = rng.choice(len(train), cfg["eurosat_n_hist"], replace=False)
    eurosat = np.stack([
        (read_image(Path(data_cfg["raw_dir"]) / train.iloc[i]["path"]) * 255)
        .round().byte().permute(1, 2, 0).numpy()  # back to uint8 (H, W, 3)
        for i in picks
    ])

    areas = {}
    for area in cfg["areas"]:
        patches, info = load_area(area, cfg)
        areas[area["name"]] = {"area": area, "values": patches, "info": info}
        print(f"{area['name']} ({area['role']}): {len(patches)} patches from {info['scene_id']} "
              f"(baseline {info['processing_baseline']}, offset removed: {info['offset_removed']})")

    # Fit the calibration on the "fit" areas only.
    fit_names = [a["name"] for a in cfg["areas"] if a["role"] == "fit"]
    fit_pixels = np.concatenate([areas[n]["values"].reshape(-1, 3) for n in fit_names])
    calibration = fit_calibration(
        fit_pixels, eurosat_to_dn(eurosat.reshape(-1, 3), scale_max), cfg["calibration_percentiles"]
    )
    calibration_record = {
        **calibration,
        "how": "calibrated = gain * L2A value (offset removed) + shift, per colour "
               "(red, green, blue), then the EuroSAT 0-scale_max stretch",
        "fit_areas": {n: areas[n]["info"]["scene_id"] for n in fit_names},
        "fit_pixels": len(fit_pixels),
        "target": f"{len(eurosat)} random EuroSAT train images (seed {cfg['seed']}), "
                  "stretch undone",
        "percentiles": cfg["calibration_percentiles"],
        "scale_max": scale_max,
    }
    calibration_path = Path(cfg["calibration_path"])
    calibration_path.write_text(json.dumps(calibration_record, indent=2), encoding="utf-8")
    print(f"Saved {calibration_path}: gain {calibration['gain']}, shift {calibration['shift']}")

    results = {"scale_max": scale_max, "calibration_path": cfg["calibration_path"], "sources": {}}
    results["sources"]["eurosat_train"] = {"n_images": len(eurosat), **colour_stats(eurosat)}
    sources = [("EuroSAT (train split)", eurosat[:cfg["eurosat_n_show"]], eurosat, "k-")]
    rgb = {}
    for name, entry in areas.items():
        plain = values_to_rgb(entry["values"], NO_CALIBRATION, scale_max)
        calibrated = values_to_rgb(entry["values"], calibration, scale_max)
        rgb[name] = (plain, calibrated)
        results["sources"][name] = {
            "role": entry["area"]["role"], "bbox": entry["area"]["bbox"], **entry["info"],
            "n_patches": len(plain),
            "plain": colour_stats(plain),
            "calibrated": colour_stats(calibrated),
        }
        if entry["area"]["role"] == "fit":
            continue  # fit areas are not shown: matching them would prove nothing
        shown = rng.choice(len(plain), cfg["n_show"], replace=False)
        date = entry["info"]["date"][:10]
        sources.append((f"{name} {date}\nplain stretch", plain[shown], plain, "--"))
        sources.append((f"{name} {date}\ncalibrated", calibrated[shown], calibrated, "-"))

    save_comparison(sources, Path(cfg["figure_path"]))
    print(f"Saved {cfg['figure_path']}")

    # Check area: what does the model say, without and with calibration?
    check = next(a["name"] for a in cfg["areas"] if a["role"] == "check")
    plain, calibrated = rgb[check]
    pred_plain = predict_patches(cfg["model_run"], plain)
    pred_calib = predict_patches(cfg["model_run"], calibrated)
    results["check_predictions"] = {
        "area": check, "model_run": cfg["model_run"], "n_patches": len(plain),
        "plain": {"counts": class_counts(pred_plain[0]),
                  "mean_confidence": round(float(pred_plain[1].mean()), 4)},
        "calibrated": {"counts": class_counts(pred_calib[0]),
                       "mean_confidence": round(float(pred_calib[1].mean()), 4)},
        "same_prediction_share": round(float((pred_plain[0] == pred_calib[0]).mean()), 4),
    }
    show = rng.choice(len(plain), 16, replace=False)
    title = (f"{cfg['model_run']} on random {check} patches (shown calibrated). "
             "No true labels: judge by eye.")
    save_predictions(
        calibrated[show],
        (pred_plain[0][show], pred_plain[1][show]),
        (pred_calib[0][show], pred_calib[1][show]),
        title,
        Path(cfg["predictions_figure_path"]),
    )
    print(f"Saved {cfg['predictions_figure_path']}")

    Path(cfg["results_path"]).write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Saved {cfg['results_path']}")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
