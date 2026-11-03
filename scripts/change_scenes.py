"""Step 4.6: which Sentinel-2 L2A scenes exist for the Ahmedabad change-study box, month by month.

Run from the repo root: python scripts/change_scenes.py --config configs/change.yaml
Saves a JSON (every clear scene with its processing baseline) and a readable Markdown table.
"""

import argparse
import calendar
import json
import sys
from pathlib import Path

import pandas as pd
import planetary_computer
import pystac_client
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.imagery import COLLECTION, STAC_URL, month_summary  # noqa: E402


def months(start, end):
    """'2017-12', '2019-02' -> ['2017-12', '2018-01', ..., '2019-02']."""
    return [str(p) for p in pd.period_range(start, end, freq="M")]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    bbox, max_cloud = cfg["bbox"], cfg["max_cloud"]

    catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    result = {"bbox": bbox, "max_cloud": max_cloud, "collection": COLLECTION, "months": {}}
    rows = []
    for start, end in cfg["month_ranges"]:
        for month in months(str(start), str(end)):
            year, mon = int(month[:4]), int(month[5:])
            last_day = calendar.monthrange(year, mon)[1]
            # No cloud filter here: we want to see every scene that touches the box.
            search = catalog.search(
                collections=[COLLECTION], bbox=bbox, datetime=f"{month}-01/{month}-{last_day:02d}"
            )
            summary = month_summary(list(search.items()), bbox, max_cloud)
            result["months"][month] = summary
            # The same picture can appear more than once: in two overlapping tiles, and sometimes
            # as an older and a re-processed copy. Count each date once.
            days = sorted({s["date"][8:] for s in summary["scenes"]})
            tiles = sorted({str(s["tile"]) for s in summary["scenes"]})
            baselines = sorted({str(s["baseline"]) for s in summary["scenes"]})
            rows.append(
                f"| {month} | {summary['touching']} | {summary['covering']} | {summary['clear']} "
                f"| {len(days)} | {', '.join(days)} | {', '.join(tiles)} | {', '.join(baselines)} |"
            )
            print(rows[-1], flush=True)

    Path(cfg["scenes_json"]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    header = [
        "# Sentinel-2 L2A scenes for the Ahmedabad change box (step 4.6)",
        "",
        f"Made by `scripts/change_scenes.py` (config `configs/change.yaml`). Box {bbox}, "
        f"clear = covers the whole box and whole-scene cloud < {max_cloud}%.",
        "Full scene list with tile, cloud % and offset flag: `results/change_scenes.json`.",
        "Counts of scenes include duplicates (two overlapping tiles, re-processed copies);",
        "'clear days' counts each date once.",
        "",
        "| month | touching | cover whole box | clear scenes | clear days | days | tiles "
        "| baselines |",
        "|---|---|---|---|---|---|---|---|",
    ]
    Path(cfg["scenes_md"]).write_text("\n".join(header + rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
