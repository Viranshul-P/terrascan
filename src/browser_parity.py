"""Does the in-browser "Map your own area" match the Python pipeline? (configs/browser_parity.yaml)

Reads the browser's runs (web/scripts/browser-parity.mjs -> results/browser_parity_runs.json),
maps the same boxes and years with src/live.py map_box (the API's code, real Planetary Computer
downloads), and compares them square by square: same tile and scenes, same number of squares, same
square centres, same class, and how far the confidences differ. Writes results/browser_parity.json.
    python -m src.browser_parity
"""

import json
import math
from pathlib import Path

import yaml

from src.live import load_context, map_box

M_PER_DEGREE = 111_320  # metres per degree of latitude (same constant as src/live.py)


def centre_offset_m(a, b):
    """Distance in metres between two (lon, lat) points a few metres apart (flat-earth formula)."""
    dx = (a[0] - b[0]) * M_PER_DEGREE * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * M_PER_DEGREE
    return math.hypot(dx, dy)


def python_patches(result, year):
    """Class, confidence and centre (lon, lat) of every square in a map_box answer."""
    out = []
    for f in result["patches_geojson"]["features"]:
        ring = f["geometry"]["coordinates"][0][:4]
        out.append({"cls": f["properties"][f"class_{year}"],
                    "conf": f["properties"][f"confidence_{year}"],
                    "lon": sum(p[0] for p in ring) / 4, "lat": sum(p[1] for p in ring) / 4})
    return out


def compare(browser, python):
    """Square-by-square comparison of two lists of patches in the same (row-major) order."""
    same_count = len(browser) == len(python)
    pairs = list(zip(browser, python)) if same_count else []
    agree = sum(b["cls"] == p["cls"] for b, p in pairs)
    return {
        "n_browser": len(browser),
        "n_python": len(python),
        "same_squares": same_count,
        "max_centre_offset_m": round(max((centre_offset_m((b["lon"], b["lat"]),
                                                          (p["lon"], p["lat"]))
                                          for b, p in pairs), default=0.0), 3),
        "same_class": agree,
        "class_agreement": round(agree / len(pairs), 4) if pairs else None,
        "max_confidence_diff": round(max((abs(b["conf"] - p["conf"]) for b, p in pairs),
                                         default=0.0), 4),
    }


def main(config="configs/browser_parity.yaml"):
    cfg = yaml.safe_load(Path(config).read_text(encoding="utf-8"))
    browser = json.loads(Path(cfg["browser_runs"]).read_text(encoding="utf-8"))
    ctx = load_context(cfg["api_config"])
    rows = []
    for run in browser["runs"]:
        row = {"box": run["name"], "year": run["year"], "bbox": run["bbox"]}
        if not run["ok"]:
            row["error"] = f"browser: {run['error']}"
            rows.append(row)
            continue
        py = map_box(run["bbox"], run["year"], ctx)
        row["same_tile"] = py["tile"] == run["tile"]
        row["same_scenes"] = py["years"][run["year"]]["scenes"] == run["scenes"]
        row.update(compare(run["patches"], python_patches(py, run["year"])))
        row["browser_backend"] = run["backend"]
        row["browser_ms"] = run["timings_ms"]
        print(row["box"], row["year"], row.get("class_agreement"), row["max_centre_offset_m"])
        rows.append(row)
    ok = [r for r in rows if "error" not in r and r["same_squares"]]
    squares = sum(r["n_python"] for r in ok)
    agree = sum(r["same_class"] for r in ok)
    summary = {
        "runs": len(rows),
        "runs_compared": len(ok),
        "squares_compared": squares,
        "squares_same_class": agree,
        "class_agreement": round(agree / squares, 4) if squares else None,
        "all_same_scenes": all(r.get("same_scenes") for r in ok),
        "max_centre_offset_m": max((r["max_centre_offset_m"] for r in ok), default=None),
        "max_confidence_diff": max((r["max_confidence_diff"] for r in ok), default=None),
        "median_browser_total_ms": sorted(r["browser_ms"]["total"] for r in ok)[len(ok) // 2]
        if ok else None,
        "browser": browser["browser"],
    }
    out = {"what": "in-browser engine (web/src/live/) vs src/live.py map_box, same boxes and years",
           "config": config, "summary": summary, "runs": rows}
    Path(cfg["output"]).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
