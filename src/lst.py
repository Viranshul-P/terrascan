"""Step 8.9 (optional extension): Landsat surface temperature vs the model's land use, Ahmedabad.

Not a main result: one date, model labels that are wrong about a third of the time on Indian test
data, and a thermal band measured at 100 m and served at 30 m. See configs/lst.yaml.
    python -m src.lst --config configs/lst.yaml
"""

import argparse
import json
import statistics
from pathlib import Path

import matplotlib
import numpy as np
import planetary_computer
import pystac_client
import rasterio
import yaml
from pyproj import Transformer
from rasterio.windows import from_bounds

from src.imagery import STAC_URL

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def kelvin_to_celsius(dn, scale, offset, nodata):
    """Landsat C2 L2 ST_B10 digital numbers -> degrees Celsius (NaN where no data)."""
    t = dn.astype(np.float64) * scale + offset - 273.15
    t[dn == nodata] = np.nan
    return t


def square_means(st, transform, crs, features, year, min_pixels):
    """Mean temperature of each square (its UTM bounding box), with the square's class."""
    to = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    inv = ~transform
    out = []
    for f in features:
        ring = f["geometry"]["coordinates"][0][:4]
        xs, ys = to.transform([p[0] for p in ring], [p[1] for p in ring])
        cols, rows = zip(*[inv * (x, y) for x, y in zip(xs, ys)])
        r0, r1 = int(np.floor(min(rows))), int(np.ceil(max(rows)))
        c0, c1 = int(np.floor(min(cols))), int(np.ceil(max(cols)))
        block = st[max(r0, 0):max(r1, 0), max(c0, 0):max(c1, 0)]
        valid = block[~np.isnan(block)]
        if valid.size >= min_pixels:
            out.append({"cls": f["properties"][f"class_{year}"], "lst_c": float(valid.mean())})
    return out


def by_class(rows, min_squares):
    """Per class: number of squares, median and quartiles of the square means (degrees C)."""
    table = {}
    for c in sorted({r["cls"] for r in rows}):
        v = sorted(r["lst_c"] for r in rows if r["cls"] == c)
        q = statistics.quantiles(v, n=4) if len(v) > 1 else [v[0]] * 3
        table[c] = {"n_squares": len(v), "median_c": round(q[1], 2), "q1_c": round(q[0], 2),
                    "q3_c": round(q[2], 2), "too_few": len(v) < min_squares}
    return table


def clearest_scene(cfg, bbox):
    cat = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    items = list(cat.search(collections=[cfg["collection"]], bbox=bbox, datetime=cfg["window"],
                            query={"eo:cloud_cover": {"lt": cfg["max_cloud"]}}).items())
    return min(items, key=lambda i: i.properties["eo:cloud_cover"])


def report_lines(cfg, out, table, n_used, n_total):
    rows = sorted(table.items(), key=lambda kv: kv[1]["median_c"])
    return [
        "# Land-surface temperature vs land use, Ahmedabad (EXTENSION, step 8.9)", "",
        "**This is an extension, not a main result.** Similar studies exist; nothing here is new.",
        "",
        f"Scene: `{out['scene']}` ({out['platform']}, {out['date']}, cloud {out['cloud_cover']}%), "
        f"band ST_B10 (Collection 2 Level-2 surface temperature). Squares used: {n_used} of "
        f"{n_total} (at least {cfg['min_pixels']} valid 30 m pixels). Classes: the model's "
        f"{cfg['year']} map (`{cfg['patches_geojson']}`).", "",
        "| Class | Squares | Median °C | Quartiles °C |", "|---|---:|---:|---|",
        *[f"| {c}{' (too few)' if v['too_few'] else ''} | {v['n_squares']} | {v['median_c']} | "
          f"{v['q1_c']} - {v['q3_c']} |" for c, v in rows],
        "", f"![LST](../{Path(cfg['figure']).as_posix()})", "", "## Limits", "",
        *[f"- {x}" for x in out["limits"]], "",
        "Made by `src/lst.py` with `configs/lst.yaml`; numbers in `results/lst_ahmedabad.json`.",
    ]


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    cfg = yaml.safe_load(Path(p.parse_args(argv).config).read_text(encoding="utf-8"))
    summary = json.loads(Path(cfg["summary_json"]).read_text(encoding="utf-8"))
    features = json.loads(Path(cfg["patches_geojson"]).read_text(encoding="utf-8"))["features"]
    lons = [c[0] for c in summary["overlay_corners"]]
    lats = [c[1] for c in summary["overlay_corners"]]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    item = clearest_scene(cfg, bbox)
    band = item.assets["lwir11"]
    meta = band.extra_fields["raster:bands"][0]
    with rasterio.open(band.href) as src:
        tb = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True).transform_bounds(*bbox)
        win = from_bounds(*tb, transform=src.transform).round_offsets().round_lengths()
        dn = src.read(1, window=win)
        transform, crs = src.window_transform(win), src.crs
    st = kelvin_to_celsius(dn, meta["scale"], meta["offset"], meta["nodata"])
    rows = square_means(st, transform, crs, features, cfg["year"], cfg["min_pixels"])
    table = by_class(rows, cfg["min_squares_per_class"])
    out = {
        "what": "EXTENSION: Landsat surface temperature per 640 m square vs the model's 2026 class",
        "scene": item.id, "date": item.properties["datetime"][:10],
        "cloud_cover": item.properties["eo:cloud_cover"], "platform": item.properties["platform"],
        "squares_used": len(rows), "squares_total": len(features), "by_class": table,
        "limits": ["one winter date, about 10:30 local time", "thermal band measured at 100 m, "
                   "served at 30 m", "classes are model predictions, not ground truth",
                   "a square's bounding box in UTM is used (slightly larger than the square)",
                   "the scene's edge cuts off the west of the city, so not every square is used"],
    }
    Path(cfg["output_json"]).write_text(json.dumps(out, indent=1), encoding="utf-8")
    ok = sorted((c for c, v in table.items() if not v["too_few"]),
                key=lambda c: table[c]["median_c"])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5), gridspec_kw={"width_ratios": [1, 1.2]})
    im = a1.imshow(st, cmap="inferno")
    a1.set_title(f"Surface temperature, {out['date']} ({out['platform']})")
    a1.axis("off")
    fig.colorbar(im, ax=a1, label="°C", shrink=0.8)
    a2.boxplot([[r["lst_c"] for r in rows if r["cls"] == c] for c in ok], vert=False,
               tick_labels=ok, showfliers=False)
    a2.set_xlabel("mean surface temperature of the square (°C)")
    a2.set_title("By the model's 2026 class (extension, one date)")
    fig.tight_layout()
    Path(cfg["figure"]).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(cfg["figure"], dpi=120)
    lines = report_lines(cfg, out, table, len(rows), len(features))
    Path(cfg["output_md"]).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[4:]))


if __name__ == "__main__":
    main()
