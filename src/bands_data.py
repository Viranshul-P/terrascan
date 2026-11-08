"""Step 8.3a: prepare the multispectral data on both sides and check it.

    python -m src.bands_data eurosat   --config configs/bands.yaml
    python -m src.bands_data india     --config configs/bands.yaml
    python -m src.bands_data calibrate --config configs/bands.yaml

eurosat:   check the EuroSAT_MS zip (MD5) and that it matches our split files, work out its band
           order and how it resampled the 20 m / 60 m bands, build one memmap of all 27,000
           images, save the train stats.
india:     read the extra bands for the 5 Indian areas and the 3 European fit areas, per scene,
           with the per-scene offset rule, on the exact grid of the existing RGB reads.
calibrate: fit one L2A -> L1C line per band on the European scenes only, and check that the new
           pipeline reproduces the existing RGB patches.
Everything is written to results/bands_check.json (and data/bands_stats.json and
results/bands_calibration.json).
"""

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import planetary_computer
import pystac_client
import rasterio
import yaml
from affine import Affine
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.warp import Resampling, reproject

from src.bands import calibrate_bands, channel_stats, india_array_with_b10
from src.data import CLASSES, read_image
from src.imagery import (
    COLLECTION,
    STAC_URL,
    box_grid,
    fit_calibration,
    needs_offset_fix,
    remove_offset,
    to_eurosat_rgb,
)

# ---------- EuroSAT_MS side ----------


def md5_of(path, chunk=1 << 20):
    h = hashlib.md5()
    with open(path, "rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def key_of(path):
    """('AnnualCrop', 'AnnualCrop_406') from a path like
    EuroSAT_RGB/AnnualCrop/AnnualCrop_406.jpg."""
    p = Path(path)
    return p.parent.name, p.stem


def zip_tif_names(zf):
    """{(class, stem): name inside the zip} for every .tif in the zip."""
    return {key_of(n): n for n in zf.namelist() if n.lower().endswith(".tif")}


def split_table(splits_dir):
    """All three split CSVs in one table with a `split` column and the (class, stem) key; row order
        =
    train, then val, then test, each in the CSV's own order (never re-split)."""
    parts = []
    for split in ("train", "val", "test"):
        df = pd.read_csv(Path(splits_dir) / f"{split}.csv")
        df["split"] = split
        parts.append(df)
    table = pd.concat(parts, ignore_index=True)
    table["key"] = [key_of(p) for p in table["path"]]
    table["row"] = np.arange(len(table))
    return table


def match_report(zip_keys, table):
    """Does EuroSAT_MS hold exactly the images in our split files? Returns a dict of facts."""
    ours = set(table["key"])
    theirs = set(zip_keys)
    per_class_ours = table["label"].value_counts().to_dict()
    per_class_zip = pd.Series([k[0] for k in theirs]).value_counts().to_dict()
    return {
        "images_in_splits": len(table),
        "images_in_ms_zip": len(theirs),
        "in_splits_not_in_zip": len(ours - theirs),
        "in_zip_not_in_splits": len(theirs - ours),
        "label_equals_folder": bool(
            all(k[0] == lab for k, lab in zip(table["key"], table["label"]))
        ),
        "per_class_equal": per_class_ours == per_class_zip,
        "classes_equal_project_classes": sorted(per_class_zip) == sorted(CLASSES),
    }


def read_tif(data):
    """(bands, H, W) array and band descriptions of one GeoTIFF given as bytes."""
    with MemoryFile(data) as mem, mem.open() as ds:
        return ds.read(), list(ds.descriptions), ds.dtypes[0]


def build_memmap(cfg, table, zf, names):
    """Write (N, 13, 64, 64) uint16 for every row of `table`, in row order. Returns the array."""
    ms = cfg["eurosat_ms"]
    n_bands = len(cfg["all_bands"])
    arr = np.lib.format.open_memmap(
        ms["array_path"], mode="w+", dtype=np.uint16, shape=(len(table), n_bands, 64, 64)
    )
    for i, key in enumerate(table["key"]):
        data, _, _ = read_tif(zf.read(names[key]))
        assert data.shape == (n_bands, 64, 64), (key, data.shape)
        arr[i] = data
    arr.flush()
    return arr


def band_order_check(array, table, cfg, rgb_dir, n=300, seed=42):
    """Which MS band matches each colour of the JPEG? Compares the 13 bands (stretched like the
        JPEGs)
    with the JPEG's red, green and blue over a seeded sample, using correlation.
    Also the plain difference after our stretch, for the expected bands."""
    rng = np.random.default_rng(seed)
    picks = rng.choice(len(table), size=n, replace=False)
    all_bands = cfg["all_bands"]
    corr = np.zeros((3, len(all_bands)))
    diff = np.zeros(3)
    jpeg_all, ms_all = [], []
    for i in picks:
        jpeg = (
            read_image(Path(rgb_dir) / table.loc[i, "path"]).numpy() * 255
        ).round()  # (3, 64, 64)
        raw = np.asarray(array[table.loc[i, "row"]])
        jpeg_all.append(jpeg.reshape(3, -1))
        ms_all.append(raw.astype(np.float64).reshape(len(all_bands), -1))
    jpeg_cat = np.concatenate(jpeg_all, axis=1)
    ms_cat = np.concatenate(ms_all, axis=1)
    for c in range(3):
        for b in range(len(all_bands)):
            corr[c, b] = np.corrcoef(jpeg_cat[c], ms_cat[b])[0, 1]
    best = [all_bands[int(corr[c].argmax())] for c in range(3)]
    expected = cfg["rgb"]  # red, green, blue = B04, B03, B02
    for c, band in enumerate(expected):
        stretched = np.clip(
            1 + ms_cat[all_bands.index(band)] * 254 / cfg["scale_max"], 1, 255
        ).round()
        diff[c] = np.abs(stretched - jpeg_cat[c]).mean()
    return {
        "sample_images": n,
        "best_matching_band_for_red_green_blue": best,
        "expected_red_green_blue": expected,
        "band_order_confirmed": best == expected,
        "correlation_red_green_blue_with_expected_band": [
            float(corr[c, all_bands.index(b)]) for c, b in enumerate(expected)
        ],
        "mean_abs_pixel_difference_after_our_stretch_red_green_blue": diff.tolist(),
        "note": "JPEGs are lossy, so a small difference is expected; not zero.",
    }


def full_band_order_check(array, table, cfg, n=2000, seed=42):
    """Is the order of all 13 channels the one in the config? Two independent kinds of evidence:
    (1) torchgeo's documented band order for this same dataset; (2) physical signatures in the data:
    the cirrus band B10 is nearly dark, B8A is almost the same picture as B07/B08, SWIR1 (B11) is
    brighter than SWIR2 (B12), B12 correlates with B11."""
    from torchgeo.datasets import EuroSAT

    rng = np.random.default_rng(seed)
    rows = table.loc[rng.choice(len(table), size=n, replace=False), "row"].to_numpy()
    x = np.asarray(array[np.sort(rows)]).astype(np.float64)  # (n, 13, 64, 64)
    bands = cfg["all_bands"]
    mean = {b: float(x[:, k].mean()) for k, b in enumerate(bands)}
    flat = x.transpose(1, 0, 2, 3).reshape(len(bands), -1)
    corr = np.corrcoef(flat)

    def c(a, b):
        return float(corr[bands.index(a), bands.index(b)])

    out = {
        "torchgeo_all_band_names": list(EuroSAT.all_band_names),
        "config_equals_torchgeo_order": list(EuroSAT.all_band_names) == bands,
        "mean_raw_value_per_band": mean,
        "cirrus_B10_is_nearly_dark": mean["B10"] < 100,
        "corr_B8A_B07": c("B8A", "B07"),
        "corr_B8A_B08": c("B8A", "B08"),
        "B8A_corr_with_B07_B08_above_0.95": min(c("B8A", "B07"), c("B8A", "B08")) > 0.95,
        "SWIR1_B11_brighter_than_SWIR2_B12": mean["B11"] > mean["B12"],
        "corr_B11_B12": c("B11", "B12"),
    }
    out["all_signatures_hold"] = bool(
        out["config_equals_torchgeo_order"]
        and out["cirrus_B10_is_nearly_dark"]
        and out["B8A_corr_with_B07_B08_above_0.95"]
        and out["SWIR1_B11_brighter_than_SWIR2_B12"]
    )
    assert out["all_signatures_hold"], (
        "the band order in configs/bands.yaml does not match the data"
    )
    return out


def resampling_signature(array, table, cfg, n=100, seed=42):
    """How were the 20 m and 60 m bands brought to the 10 m grid? Share of neighbouring pixel pairs
        with
    exactly equal values, per band (rows and columns). Native 10 m bands have a low share; a band
    that was copied up with 'nearest' has a high share (about 1/2 at 2x, about 5/6 at 6x)."""
    rng = np.random.default_rng(seed)
    picks = table.loc[rng.choice(len(table), size=n, replace=False), "row"].tolist()
    batch = np.stack([np.asarray(array[r]) for r in picks]).astype(np.int64)  # (n, 13, 64, 64)
    equal_x = (batch[..., :, 1:] == batch[..., :, :-1]).mean(axis=(0, 2, 3))
    equal_y = (batch[..., 1:, :] == batch[..., :-1, :]).mean(axis=(0, 2, 3))
    return {
        b: {"equal_neighbour_share": float((x + y) / 2)}
        for b, x, y in zip(cfg["all_bands"], equal_x, equal_y)
    }


def eurosat_train_stats(array, table, cfg, chunk=500):
    """Mean/std of every channel over the TRAIN split only, in the representation the models use."""
    rows = table[table["split"] == "train"]["row"].to_numpy()

    def batches():
        for start in range(0, len(rows), chunk):
            yield np.asarray(array[rows[start : start + chunk]])

    return channel_stats(batches(), cfg)


def run_eurosat(cfg):
    ms = cfg["eurosat_ms"]
    check = {}
    zip_path = Path(ms["zip_path"])
    digest = md5_of(zip_path)
    check["md5"] = {"expected": ms["md5"], "got": digest, "ok": digest == ms["md5"]}
    assert digest == ms["md5"], "EuroSAT_MS.zip is damaged or incomplete (MD5 differs)"
    print("MD5 ok")

    table = split_table(cfg["splits_dir"])
    with zipfile.ZipFile(zip_path) as zf:
        names = zip_tif_names(zf)
        check["match"] = match_report(names.keys(), table)
        print(json.dumps(check["match"], indent=1))
        assert check["match"]["in_splits_not_in_zip"] == 0, "some split images are missing in MS"
        _, descriptions, dtype = read_tif(zf.read(names[table.loc[0, "key"]]))
        check["tif"] = {"dtype": dtype, "band_descriptions": descriptions}
        array = build_memmap(cfg, table, zf, names)
    print(f"memmap {array.shape} -> {ms['array_path']}")
    table.drop(columns=["key"]).to_csv(ms["index_path"], index=False)
    check["order_in_array"] = "train.csv rows, then val.csv, then test.csv (index CSV has the row)"
    check["band_order"] = band_order_check(array, table, cfg, cfg["rgb_jpeg_dir"])
    check["band_order_full"] = full_band_order_check(array, table, cfg)
    check["resampling"] = resampling_signature(array, table, cfg)
    stats = eurosat_train_stats(array, table, cfg)
    Path(cfg["stats_path"]).write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    check["stats_file"] = cfg["stats_path"]
    update_check(cfg, "eurosat", check)
    print(json.dumps(check["band_order"], indent=1))
    print(json.dumps(check["resampling"], indent=1))


# ---------- Indian / European scenes: extra bands on the existing 10 m grid ----------


def item_by_id(scene_id):
    """The Planetary Computer item of a Sentinel-2 L2A scene."""
    catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    return next(catalog.search(collections=[COLLECTION], ids=[scene_id]).items())


def read_bands_on_grid(item, bands, crs, grid, shape, resampling):
    """Raw values (H, W, len(bands)) uint16 of each band, resampled onto the given 10 m grid.

    grid: Affine of the output (the one src.imagery.box_grid gives for the box), shape: (H, W).
    10 m bands land exactly on their own pixels; 20 m and 60 m bands are resampled with
    `resampling`.
    0 stays "no data".
    """
    out = np.zeros(tuple(shape) + (len(bands),), dtype=np.uint16)
    for k, band in enumerate(bands):
        plane = np.zeros(tuple(shape), dtype=np.uint16)
        with rasterio.open(item.assets[band].href) as src:
            reproject(
                source=rasterio.band(src, 1),
                destination=plane,
                dst_transform=grid,
                dst_crs=crs,
                src_nodata=0,
                dst_nodata=0,
                resampling=resampling,
            )
        out[..., k] = plane
    return out


def read_scene_bands(scene_id, bands, crs, grid, shape, resampling):
    """Offset-free values of `bands` for one scene (offset decided per scene from its baseline).
    Also returns the smallest non-zero RAW value per band: in a scene with the +1000 offset it
    should be
    near 1000, in a scene without it near 0, which checks the rule band by band."""
    item = item_by_id(scene_id)
    raw = read_bands_on_grid(item, bands, crs, grid, shape, resampling)
    min_raw = {b: int(raw[..., k][raw[..., k] > 0].min()) for k, b in enumerate(bands)}
    values = remove_offset(raw, item).astype(np.uint16)
    return values, {
        "scene_id": scene_id,
        "baseline": item.properties["s2:processing_baseline"],
        "offset_removed": bool(needs_offset_fix(item)),
        "min_nonzero_raw_value_per_band": min_raw,
    }


def l2a_bands(cfg):
    """The bands Planetary Computer's L2A scenes have, in all_bands order (no B10)."""
    return [b for b in cfg["all_bands"] if b not in cfg["missing_on_india"]]


def area_jobs(cfg):
    """[(name, kind, bbox, scene_id, cached RGB npz path, output path)] for Indian and fit areas."""
    india = yaml.safe_load(Path(cfg["india_config"]).read_text(encoding="utf-8"))
    imagery = yaml.safe_load(Path(cfg["imagery_config"]).read_text(encoding="utf-8"))
    cache = Path(india["cache_dir"])
    fit_ids = json.loads(Path("results/imagery_calibration.json").read_text(encoding="utf-8"))[
        "fit_areas"
    ]
    jobs = []
    for area in india["areas"]:
        saved = cache / f"india_{area['name']}.npz"
        scene_id = str(np.load(saved)["scene_id"])
        out = Path(cfg["india_bands_dir"]) / f"{area['name']}.npz"
        jobs.append((area["name"], "india", area["bbox"], scene_id, saved, out))
    for area in imagery["areas"]:
        if area.get("role") == "check":  # held-out European area (Munich), as in step 4.1
            saved = cache / f"{area['name']}.npz"
            jobs.append(
                (
                    area["name"],
                    "check",
                    area["bbox"],
                    str(np.load(saved)["scene_id"]),
                    saved,
                    cache / f"bands_{area['name']}.npz",
                )
            )
        elif area["name"] in cfg["fit_areas"]:
            out = cache / f"bands_{area['name']}.npz"
            jobs.append(
                (
                    area["name"],
                    "fit",
                    area["bbox"],
                    fit_ids[area["name"]],
                    cache / f"{area['name']}.npz",
                    out,
                )
            )
    return jobs


def run_india(cfg):
    """Read the extra bands for every job; check the RGB against the existing cached reads."""
    resampling = getattr(Resampling, cfg["india_resampling"])
    bands = l2a_bands(cfg)
    rgb_positions = [bands.index(b) for b in cfg["rgb"]]
    report = {"resampling": cfg["india_resampling"], "bands": bands, "areas": {}}
    for name, kind, bbox, scene_id, cached, out in area_jobs(cfg):
        saved = np.load(cached)
        item = item_by_id(scene_id)
        crs, grid = box_grid(item, bbox)
        shape = saved["values"].shape[:2]
        if kind == "india":
            assert str(saved["crs"]) == crs and np.allclose(Affine(*saved["grid"]), grid)
        values, info = read_scene_bands(scene_id, bands, crs, grid, shape, resampling)
        # The three colours must equal the RGB read made in step 4.1/4.2, value for value.
        same = bool(np.array_equal(values[..., rgb_positions], saved["values"]))
        info["rgb_equals_existing_read"] = same
        info["kind"] = kind
        assert same, f"{name}: the new reads do not reproduce the existing RGB values"
        out.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            out,
            values=values,
            has_data=saved["has_data"],
            bands=np.array(bands),
            crs=crs,
            grid=np.array(grid)[:6],
            scene_id=scene_id,
            resampling=cfg["india_resampling"],
        )
        report["areas"][name] = info
        print(
            f"{name} ({kind}): {values.shape}, baseline {info['baseline']}, "
            f"offset removed {info['offset_removed']}, RGB equals existing: {same}"
        )
    update_check(cfg, "india_reads", report)


# ---------- per-band calibration (European scenes only) ----------


def fit_band_calibration(cfg):
    """Fit gain * value + shift per band so European Level-2A scenes match EuroSAT_MS (Level-1C).

    Same idea as the 4.1 colour fit: match percentiles of the pixels of the European fit scenes
    (never India) to those of `eurosat_fit_images` random EuroSAT_MS TRAIN images, with one straight
    line per band. RGB keeps its 4.1 numbers (the JPEG-based fit) so the baseline does not move; the
    MS-based RGB fit is saved next to it as a cross-check of the method.
    """
    bands = l2a_bands(cfg)
    imagery = yaml.safe_load(Path(cfg["imagery_config"]).read_text(encoding="utf-8"))
    percentiles = imagery["calibration_percentiles"]
    jobs = area_jobs(cfg)
    ours = []
    for _, kind, _, _, _, out in jobs:
        if kind == "fit":
            saved = np.load(out)
            ours.append(saved["values"][saved["has_data"]].astype(np.float64))
    ours = np.concatenate(ours)

    ms = cfg["eurosat_ms"]
    array = np.load(ms["array_path"], mmap_mode="r")
    index = pd.read_csv(ms["index_path"])
    train_rows = index[index["split"] == "train"]["row"].to_numpy()
    rng = np.random.default_rng(cfg["eurosat_fit_seed"])
    rows = np.sort(rng.choice(train_rows, size=cfg["eurosat_fit_images"], replace=False))
    positions = [cfg["all_bands"].index(b) for b in bands]
    target = np.stack([np.asarray(array[r])[positions] for r in rows])  # (n, 12, 64, 64)
    target = target.transpose(0, 2, 3, 1).reshape(-1, len(bands)).astype(np.float64)

    fit = fit_calibration(ours, target, percentiles)
    # How stable is the fit? Fit each European scene on its own and compare the gains.
    per_scene = {}
    for name, kind, _, _, _, out in jobs:
        if kind == "fit":
            saved = np.load(out)
            one = saved["values"][saved["has_data"]].astype(np.float64)
            per_scene[name] = fit_calibration(one, target, percentiles)
    old = json.loads(Path("results/imagery_calibration.json").read_text(encoding="utf-8"))
    table = {b: {"gain": fit["gain"][k], "shift": fit["shift"][k]} for k, b in enumerate(bands)}
    ms_rgb_fit = {b: dict(table[b]) for b in cfg["rgb"]}
    for i, band in enumerate(cfg["rgb"]):  # red = B04 is the first colour of the 4.1 fit
        table[band] = {"gain": old["gain"][i], "shift": old["shift"][i]}
    return {
        "bands": table,
        "rgb_source": "results/imagery_calibration.json (4.1, JPEG-based), unchanged",
        "per_scene_gain_and_shift": {
            n: {bands[k]: [f["gain"][k], f["shift"][k]] for k in range(len(bands))}
            for n, f in per_scene.items()
        },
        "gain_range_over_scenes": {
            bands[k]: [
                min(f["gain"][k] for f in per_scene.values()),
                max(f["gain"][k] for f in per_scene.values()),
            ]
            for k in range(len(bands))
        },
        "ms_based_rgb_fit_for_comparison": ms_rgb_fit,
        "fit_scenes": {name: scene for name, kind, _, scene, _, _ in jobs if kind == "fit"},
        "fit_pixels": int(len(ours)),
        "target": f"{cfg['eurosat_fit_images']} random EuroSAT_MS train images "
        f"(seed {cfg['eurosat_fit_seed']}), raw values, all 12 L2A bands",
        "percentiles": percentiles,
        "how": "calibrated = gain * L2A value (offset removed) + shift, per band",
    }


def calibrated_values(path, calibration, bands, only_valid=False):
    """Calibrated values of one saved area: (H, W, 12), or (N, 12) of the pixels that have data."""
    saved = np.load(path)
    values = saved["values"].astype(np.float64)
    if only_valid:
        values = values[saved["has_data"]][:, None, :]
        return calibrate_bands(values, calibration, bands)[:, 0, :]
    return calibrate_bands(values, calibration, bands)


def load_india_arrays(cfg, calibration):
    """{area: (H, W, 13) float32 calibrated values} for the Indian areas, B10 = zero placeholder,
    ready for src.bands.IndiaBands."""
    bands = l2a_bands(cfg)
    out = {}
    for name, kind, _, _, _, path in area_jobs(cfg):
        if kind == "india":
            calibrated = calibrated_values(path, calibration, bands).astype(np.float32)
            out[name] = india_array_with_b10(calibrated, cfg)
    return out


def calibration_checks(cfg, calibration):
    """(1) The new pipeline's RGB equals the existing PNG patches pixel for pixel. (2) Per band:
    does the calibration move the held-out European check area (Munich) towards EuroSAT_MS?
    Indian numbers are only reported; nothing is chosen from them."""
    bands = l2a_bands(cfg)
    arrays = load_india_arrays(cfg, calibration)
    patches = pd.read_csv(cfg["india_patches_csv"])
    rgb_positions = [cfg["all_bands"].index(b) for b in cfg["rgb"]]
    worst = 0
    for row in patches.itertuples():
        area = arrays[row.area][row.row : row.row + 64, row.col : row.col + 64]
        rgb = to_eurosat_rgb(area[..., rgb_positions], cfg["scale_max"])
        png = np.array(Image.open(Path("data/india/patches") / row.file).convert("RGB"))
        worst = max(worst, int(np.abs(rgb.astype(int) - png.astype(int)).max()))
    out = {"patches_checked": len(patches), "max_abs_difference_rgb_vs_png": worst}
    assert worst == 0, "new RGB differs from the existing patches"

    ms = cfg["eurosat_ms"]
    array = np.load(ms["array_path"], mmap_mode="r")
    index = pd.read_csv(ms["index_path"])
    train = np.asarray(array[index[index["split"] == "train"]["row"].to_numpy()[::20]])
    positions = [cfg["all_bands"].index(b) for b in bands]
    eurosat_mean = train[:, positions].astype(np.float64).mean(axis=(0, 2, 3))
    jobs = {name: (kind, path) for name, kind, _, _, _, path in area_jobs(cfg)}
    munich_path = jobs["munich"][1]
    saved = np.load(munich_path)
    raw = saved["values"][saved["has_data"]].astype(np.float64)
    munich = calibrated_values(munich_path, calibration, bands, only_valid=True)
    finetune = np.concatenate(
        [
            calibrated_values(jobs[a][1], calibration, bands, only_valid=True)
            for a in ("ahmedabad_city", "narmada_bharuch", "ankleshwar_industrial")
        ]
    )
    out["mean_value_per_band"] = {
        b: {
            "eurosat_train_sample": float(eurosat_mean[k]),
            "munich_uncalibrated": float(raw[:, k].mean()),
            "munich_calibrated": float(munich[:, k].mean()),
            "munich_closer_after_calibration": bool(
                abs(munich[:, k].mean() - eurosat_mean[k]) < abs(raw[:, k].mean() - eurosat_mean[k])
            ),
            "india_finetune_areas_calibrated": float(finetune[:, k].mean()),
        }
        for k, b in enumerate(bands)
    }
    return out


def run_calibrate(cfg):
    calibration = fit_band_calibration(cfg)
    Path(cfg["calibration_path"]).write_text(
        json.dumps(calibration, indent=2, default=float) + "\n", encoding="utf-8"
    )
    print(f"Saved {cfg['calibration_path']}")
    checks = calibration_checks(cfg, calibration)
    update_check(cfg, "calibration", checks)
    print(json.dumps(checks, indent=1)[:3500])


def update_check(cfg, section, data):
    """Add one section to results/bands_check.json (keeps the others)."""
    path = Path(cfg["check_path"])
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    current[section] = data
    path.write_text(json.dumps(current, indent=2, default=float) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["eurosat", "india", "calibrate"])
    parser.add_argument("--config", required=True)
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    if args.stage == "eurosat":
        run_eurosat(cfg)
    elif args.stage == "india":
        run_india(cfg)
    else:
        run_calibrate(cfg)


if __name__ == "__main__":
    main()
