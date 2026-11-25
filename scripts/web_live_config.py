"""Settings for the in-browser "Map your own area" (web/src/live/) -> web/public/data/live.json.

The browser repeats src/live.py map_box step by step, so it must use exactly the same settings.
They are copied from the files the API reads (configs/api.yaml and what it points to), never
typed by hand:
  - search: dry-season windows, max cloud, how many scenes;
  - pixels: per-colour calibration and the EuroSAT stretch;
  - model: input size, mean/std, class names (onnx_info.json) and where to download the ONNX file
    (the same seed-42 file is on the Hugging Face Hub; its SHA-256 is checked against the
    local file here);
  - fine-tune boxes, so a live map can say which squares touch the data the model was tuned on;
  - the summary of results/browser_parity.json (browser vs Python), so the site can quote it.
    python scripts/web_live_config.py
"""

import hashlib
import json
from pathlib import Path

import yaml

API_CONFIG = Path("configs/api.yaml")
PARITY = Path("results/browser_parity.json")
OUT = Path("web/public/data/live.json")
MODEL_REPO = "viranshul/terrascan-efficientnet-b0-india"
MODEL_URL = f"https://huggingface.co/{MODEL_REPO}/resolve/main/model.onnx"
# SHA-256 of model.onnx as listed by the Hub
# (https://huggingface.co/api/models/<repo>/tree/main, field lfs.oid).
HUB_SHA256 = "ddfc33276e20dc9e454acb6946c2d1d697527b0ee8d644e5ccdff08e08eb2836"
# The browser downloads every scene itself, so it gets a smaller box than the API (10 km): a 6 km
# box is at most 4 picture blocks per colour per scene. Not a model setting; only speed.
BROWSER_MAX_SIDE_KM = 6


def read_yaml(path):
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def build():
    cfg = read_yaml(API_CONFIG)
    info = json.loads(Path(cfg["onnx_info_path"]).read_text(encoding="utf-8"))
    local = hashlib.sha256(Path(cfg["onnx_path"]).read_bytes()).hexdigest()
    assert local == HUB_SHA256, f"local {cfg['onnx_path']} differs from the Hub file"
    calibration = json.loads(Path(cfg["calibration_path"]).read_text(encoding="utf-8"))
    eval_cfg, india_cfg = read_yaml(cfg["india_eval_config"]), read_yaml(cfg["india_config"])
    colours = read_yaml(cfg["change_config"])["class_colours"]
    return {
        "source": "scripts/web_live_config.py from configs/api.yaml",
        "stac_url": "https://planetarycomputer.microsoft.com/api/stac/v1",
        "token_url": "https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a",
        "collection": "sentinel-2-l2a",
        "bands": ["B04", "B03", "B02"],
        "offset": 1000,
        "offset_from_baseline": [4, 0],
        "years": cfg["years"],
        "max_cloud": cfg["max_cloud"],
        "max_scenes": cfg["max_scenes"],
        "max_side_km": BROWSER_MAX_SIDE_KM,
        "patch_size": cfg["patch_size"],
        "scale_max": cfg["scale_max"],
        "calibration": {"gain": calibration["gain"], "shift": calibration["shift"]},
        "model": {"url": MODEL_URL, "sha256": HUB_SHA256, "seed": 42,
                  "image_size": info["image_size"], "mean": info["mean"], "std": info["std"],
                  "classes": info["classes"]},
        "colours": colours,
        "finetune_boxes": [a["bbox"] for a in india_cfg["areas"]
                           if a["name"] in eval_cfg["finetune_areas"]],
        "parity": parity_summary(),
    }


def parity_summary():
    """Browser vs Python on the same boxes (src/browser_parity.py), or None before it has run."""
    if not PARITY.exists():
        return None
    s = json.loads(PARITY.read_text(encoding="utf-8"))["summary"]
    keep = ["runs_compared", "squares_compared", "squares_same_class", "class_agreement",
            "all_same_scenes", "max_centre_offset_m"]
    return {"source": str(PARITY).replace("\\", "/"), **{k: s[k] for k in keep}}


def main():
    OUT.write_text(json.dumps(build(), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
