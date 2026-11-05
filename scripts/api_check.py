"""Step 5.2b: call a running API (e.g. the Docker container) and save what happened.

  docker run --rm -d -p 8000:8000 terrascan-api
  python scripts/api_check.py --url http://localhost:8000

Uses the network (Planetary Computer, through the API). Writes results/api_check.json.
"""

import argparse
import json
import time
from pathlib import Path

import httpx

OUT = Path("results/api_check.json")
REQUESTS = {
    "ahmedabad_10km_2026": {"bbox": [72.52, 23.00, 72.615, 23.088], "year": "2026"},
    "ahmedabad_10km_2018": {"bbox": [72.52, 23.00, 72.615, 23.088], "year": "2018"},
    "ahmedabad_3km_2026": {"bbox": [72.55, 23.02, 72.58, 23.047], "year": "2026"},
    "too_big_20km": {"bbox": [72.40, 23.00, 72.60, 23.20], "year": "2026"},
    "wrong_year": {"bbox": [72.55, 23.02, 72.58, 23.047], "year": "2021"},
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    args = parser.parse_args()
    results = {"url": args.url, "health": httpx.get(f"{args.url}/health").json(), "predict": {}}
    for name, body in REQUESTS.items():
        start = time.time()
        response = httpx.post(f"{args.url}/predict", json=body, timeout=120)
        entry = {"request": body, "status": response.status_code,
                 "seconds": round(time.time() - start, 1), "bytes": len(response.content)}
        answer = response.json()
        if response.status_code == 200:
            year = body["year"]
            entry.update({"tile": answer["tile"], "n_scenes": answer["years"][year]["n_scenes"],
                          "n_patches": answer["n_patches"],
                          "mean_confidence": answer["mean_confidence"][year]})
        else:
            entry["detail"] = answer["detail"]
        results["predict"][name] = entry
        print(name, entry, flush=True)
    OUT.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
