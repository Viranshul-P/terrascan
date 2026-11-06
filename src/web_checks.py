"""The 50 hand-checked squares (step 4.8) as a data file for the website's map (step 5.3b).

Reads results/change_check_sample.csv (where each checked square is),
results/change_check_reviewed.csv (the final verdicts) and results/change_check.json (the summary),
and writes web/public/data/ahmedabad/checks.json. The website only reads web/public/, so this copies
the needed values; nothing is computed anew.
    python -m src.web_checks
"""

import csv
import json
from pathlib import Path

RESULTS = Path("results")
OUT = Path("web/public/data/ahmedabad/checks.json")
SUMMARY = Path("web/public/data/ahmedabad/summary.json")
PATCH = 64  # pixels per square; the sample stores pixel row/col


def check_squares(sample, reviewed, grid_cols):
    """Per checked square: map id (row * cols + col, as in patches.geojson), place, verdict."""
    verdict = {r["pair"]: r["final"] for r in reviewed}
    return [
        {
            "pair": s["pair"],
            "id": (int(s["row"]) // PATCH) * grid_cols + int(s["col"]) // PATCH,
            "lon": float(s["lon"]),
            "lat": float(s["lat"]),
            "verdict": verdict[s["pair"]],
        }
        for s in sample
    ]


def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def main():
    summary = json.loads((RESULTS / "change_check.json").read_text(encoding="utf-8"))
    cols = json.loads(SUMMARY.read_text(encoding="utf-8"))["grid_cols"]
    squares = check_squares(
        read_csv(RESULTS / "change_check_sample.csv"),
        read_csv(RESULTS / "change_check_reviewed.csv"),
        cols,
    )
    out = {
        "made_by": "src/web_checks.py",
        "sources": [
            "results/change_check_sample.csv",
            "results/change_check_reviewed.csv",
            "results/change_check.json",
        ],
        "judged_by": summary["judged_by"],
        "n_pairs": summary["n_pairs"],
        "real_rate": summary["final"]["real_rate"],
        "reported_changed_km2": summary["reported_changed_km2"],
        "estimated_real_changed_km2": summary["estimated_real_changed_km2"],
        "squares": squares,
    }
    assert len(squares) == summary["n_pairs"], "sample and summary disagree on the number of checks"
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(squares)} squares)")


if __name__ == "__main__":
    main()
