"""Step 8.4 part 1: tier-2 ("noisy reference") labels from ESA WorldCover for many Indian squares.

See configs/noisy_labels.yaml for the rules. Writes the squares and their allowed-class sets to
data/india_tier2/ (git-ignored) and the counts, the licence note and the agreement rate with the
tier-1 hand labels to results/noisy_labels_data.json. These labels are never used to evaluate.
    python -m src.noisy_labels --config configs/noisy_labels.yaml
"""

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
import yaml
from rasterio.windows import from_bounds

from src.change import patch_footprint_lonlat
from src.data import CLASSES
from src.imagery import STAC_URL
from src.showcase import build_city

KM_PER_DEG = 111.32


def worldcover_sets(scheme_cfg):
    """WorldCover class code -> list of allowed class names (from the 8.2 mapping)."""
    classes = scheme_cfg["sources"]["worldcover"]["classes"]
    return {int(re.search(r"\((\d+)\)", k).group(1)): v for k, v in classes.items()}


def near_box(lon, lat, box, buffer_km):
    """True if the point is inside the box grown by buffer_km on every side."""
    w, s, e, n = box
    dlat = buffer_km / KM_PER_DEG
    dlon = buffer_km / (KM_PER_DEG * math.cos(math.radians(lat)))
    return w - dlon <= lon <= e + dlon and s - dlat <= lat <= n + dlat


def majority(codes):
    """Most common code and its share of the pixels (ignoring 0 = no data)."""
    codes = codes[codes > 0]
    if codes.size == 0:
        return None, 0.0
    vals, counts = np.unique(codes, return_counts=True)
    k = counts.argmax()
    return int(vals[k]), float(counts[k] / codes.size)


def label_set(code, share, sets, min_share):
    """Allowed classes for a square, or None if it is dropped (too mixed, or no class fits)."""
    if code is None or share < min_share or not sets.get(code):
        return None
    return sets[code]


def worldcover_map(cfg, bbox):
    """The WorldCover map (codes) covering bbox, its transform, from Planetary Computer."""
    cat = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    items = [i for i in cat.search(collections=[cfg["collection"]], bbox=bbox).items()
             if i.properties.get("esa_worldcover:product_version") == cfg["worldcover_version"]]
    if len(items) != 1:
        raise SystemExit(f"expected one WorldCover tile for {bbox}, found {len(items)}")
    with rasterio.open(items[0].assets["map"].href) as src:
        win = from_bounds(*bbox, transform=src.transform).round_offsets().round_lengths()
        return src.read(1, window=win), src.window_transform(win), items[0].id


def codes_in(wc, transform, lon0, lat0, lon1, lat1):
    """WorldCover codes inside a lon/lat rectangle."""
    inv = ~transform
    c0, r0 = inv * (lon0, lat1)
    c1, r1 = inv * (lon1, lat0)
    return wc[max(int(r0), 0):max(int(math.ceil(r1)), 0),
              max(int(c0), 0):max(int(math.ceil(c1)), 0)].ravel()


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    cfg = yaml.safe_load(Path(p.parse_args(argv).config).read_text(encoding="utf-8"))
    show = yaml.safe_load(Path(cfg["showcase_config"]).read_text(encoding="utf-8"))
    areas = yaml.safe_load(Path(cfg["india_config"]).read_text(encoding="utf-8"))["areas"]
    sets = worldcover_sets(yaml.safe_load(
        Path(cfg["class_scheme_config"]).read_text(encoding="utf-8")))
    calibration = json.loads(Path(show["calibration_path"]).read_text(encoding="utf-8"))
    year, size = cfg["year"], show["patch_size"]
    images, masks, meta = [], [], []
    stats = {"per_city": {}, "dropped_near_labelled_areas": 0, "dropped_mixed_or_unmapped": 0,
             "worldcover_class_kept": Counter()}
    tiles = set()
    for city in show["cities"]:
        built, crs, tr, _, patches = build_city(city, show, calibration)
        wc, wtr, tile = worldcover_map(cfg, city["bbox"])
        tiles.add(tile)
        kept = 0
        for r, c, img in patches[year]:
            fp = patch_footprint_lonlat(tr, crs, r, c, size)
            lon, lat = fp.centroid.x, fp.centroid.y
            if any(near_box(lon, lat, a["bbox"], cfg["buffer_km"]) for a in areas):
                stats["dropped_near_labelled_areas"] += 1
                continue
            code, share = majority(codes_in(wc, wtr, *fp.bounds))
            allowed = label_set(code, share, sets, cfg["min_share"])
            if allowed is None:
                stats["dropped_mixed_or_unmapped"] += 1
                continue
            images.append(img)
            masks.append([c_ in allowed for c_ in CLASSES])
            meta.append((city["id"], lon, lat, code, share))
            stats["worldcover_class_kept"][code] += 1
            kept += 1
        stats["per_city"][city["id"]] = kept
        print(city["id"], kept, "squares kept")
    out = Path(cfg["out_npz"])
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, images=np.stack(images), allowed=np.array(masks, dtype=bool),
                        city=np.array([m[0] for m in meta]), lon=np.array([m[1] for m in meta]),
                        lat=np.array([m[2] for m in meta]), wc_code=np.array([m[3] for m in meta]),
                        wc_share=np.array([m[4] for m in meta]),
                        tier=np.array(["tier2"] * len(meta)))
    agreement = agreement_rate(cfg, sets)
    result = {
        "what": "Tier-2 (noisy reference) labels from ESA WorldCover 2021 v200; never ground truth",
        "config": "configs/noisy_labels.yaml", "worldcover_tiles": sorted(tiles),
        "licence": "ESA WorldCover: CC-BY-4.0 (Planetary Computer collection 'esa-worldcover'); "
                   "credit: (c) ESA WorldCover project 2021 / Contains modified Copernicus "
                   "Sentinel data (2021) processed by ESA WorldCover consortium",
        "time_gap_note": f"map from 2021, pictures from the {year} dry season",
        "n_squares": len(meta),
        "per_city": stats["per_city"],
        "dropped_near_labelled_areas": stats["dropped_near_labelled_areas"],
        "dropped_mixed_or_unmapped": stats["dropped_mixed_or_unmapped"],
        "worldcover_class_kept": {str(k): v for k, v in
                                  sorted(stats["worldcover_class_kept"].items())},
        "allowed_sets": {str(k): v for k, v in sets.items()},
        "agreement_with_hand_labels": agreement,
    }
    Path(cfg["output_json"]).write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ["n_squares", "per_city",
                                              "agreement_with_hand_labels"]}, indent=1))


def agreement_rate(cfg, sets):
    """How often WorldCover's allowed set contains the user's final hand label (tier 1).

    An agreement rate, NOT the product's accuracy. Squares WorldCover would drop are counted apart.
    """
    import pandas as pd
    labels = pd.read_csv(cfg["labels_csv"])
    labels = labels[labels["final_label"] != "skip"]
    half_lat = 0.32 / KM_PER_DEG
    agree = n = dropped = 0
    for _, row in labels.iterrows():
        half_lon = 0.32 / (KM_PER_DEG * math.cos(math.radians(row["lat"])))
        box = (row["lon"] - half_lon, row["lat"] - half_lat, row["lon"] + half_lon,
               row["lat"] + half_lat)
        wc, _, _ = worldcover_map(cfg, list(box))
        code, share = majority(wc.ravel())
        allowed = label_set(code, share, sets, cfg["min_share"])
        if allowed is None:
            dropped += 1
            continue
        n += 1
        agree += row["final_label"] in allowed
    return {"hand_labelled_squares": int(len(labels)), "compared": n, "would_be_dropped": dropped,
            "agree": agree, "agreement_rate": round(agree / n, 4) if n else None,
            "note": "share of compared squares whose hand label is in WorldCover's allowed set"}


if __name__ == "__main__":
    main()
