"""Step 8.12: map a new area from the command line. Box and year(s) in, GeoTIFF + GeoJSON out.

Same pipeline and settings as the API and the website (src/live.py map_box, configs/api.yaml):
clearest dry-season scenes of one tile, per-scene offset fix, median composite, calibration,
64 x 64 squares, the fine-tuned EfficientNet-B0 (ONNX). Needs the internet (Planetary Computer).
    python -m src.map_area --bbox 72.55 23.0 72.6 23.05 --years 2018 2026 --out maps/my_area
Writes into --out, per year: classes_<year>.tif (one pixel per 640 m square, class number, colour
table), rgb_<year>.webp; and patches.geojson (every square, its classes and confidences) and
summary.json (km2 per class, scenes used, and, with two years, how many squares changed class).
"""

import argparse
import base64
import json
from pathlib import Path

from src.live import load_context, map_box

CONFIG = "configs/api.yaml"


def data_bytes(url):
    """The bytes inside a data URL ("data:<type>;base64,...")."""
    return base64.b64decode(url.split(",", 1)[1])


def changed_squares(results, years):
    """How many squares (same position in both years) changed class, and the total compared."""
    def classes(year):
        return {tuple(f["geometry"]["coordinates"][0][0]): f["properties"][f"class_{year}"]
                for f in results[year]["patches_geojson"]["features"]}
    a, b = classes(years[0]), classes(years[1])
    both = a.keys() & b.keys()
    return sum(a[k] != b[k] for k in both), len(both)


def run(bbox, years, out, ctx):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    results = {y: map_box(bbox, y, ctx) for y in years}
    features = {}
    for y, r in results.items():
        (out / f"classes_{y}.tif").write_bytes(data_bytes(r["files"]["geotiff"][y]))
        (out / f"rgb_{y}.webp").write_bytes(data_bytes(r["files"]["rgb"][y]))
        for f in r["patches_geojson"]["features"]:  # merge the years square by square
            key = tuple(f["geometry"]["coordinates"][0][0])
            features.setdefault(key, {"type": "Feature", "geometry": f["geometry"],
                                      "properties": {}})["properties"].update(
                {k: v for k, v in f["properties"].items() if k != "id"})
    geojson = {"type": "FeatureCollection", "features": list(features.values())}
    (out / "patches.geojson").write_text(json.dumps(geojson), encoding="utf-8")
    summary = {
        "bbox": list(bbox), "made_by": "src/map_area.py", "config": CONFIG,
        "years": {y: {k: r[k] for k in ["tile", "n_patches", "km2_per_patch"]}
                  | {"scenes": r["years"][y], "areas_km2": r["areas_km2"][y],
                     "mean_confidence": r["mean_confidence"][y]} for y, r in results.items()},
        "note": "Model predictions, not ground truth. Accuracy was only measured in Gujarat.",
    }
    if len(years) == 2:
        n, total = changed_squares(results, years)
        summary["changed_squares"] = {"changed": n, "compared": total}
    (out / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    return summary


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--bbox", type=float, nargs=4, required=True, metavar=("W", "S", "E", "N"))
    p.add_argument("--years", nargs="+", default=["2026"], help="one or two config years")
    p.add_argument("--out", required=True)
    p.add_argument("--config", default=CONFIG)
    a = p.parse_args(argv)
    s = run(a.bbox, a.years, a.out, load_context(a.config))
    for y, v in s["years"].items():
        top = sorted(v["areas_km2"].items(), key=lambda kv: -kv[1])[:3]
        print(f"{y}: {v['n_patches']} squares, tile {v['tile']}; most: "
              + ", ".join(f"{c} {km:.2f} km2" for c, km in top))
    if "changed_squares" in s:
        print(f"changed class: {s['changed_squares']['changed']} of "
              f"{s['changed_squares']['compared']} squares")
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
