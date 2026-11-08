"""Step 6.2: build the folder for the Hugging Face Space that runs the API.

    python -m src.hf_space --config configs/hf_space.yaml

The Space needs a README.md whose first lines tell Hugging Face to use Docker and which port the
API listens on, a file called Dockerfile, and the code. The model is not copied: the Dockerfile
downloads it from the model repo.
"""

import argparse
import shutil
from pathlib import Path

import yaml

HEADER = """---
title: TerraScan API
emoji: 🛰️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
short_description: Land-use maps from Sentinel-2, boxes up to 10 x 10 km
---

# TerraScan API

The backend of "Map your own area" on the TerraScan website. It reads Sentinel-2 images for the
box you draw, cuts them into 640 m squares and names each square with the
[fine-tuned EfficientNet-B0](https://huggingface.co/{model_repo}).

- `GET /health` says whether the server is awake and what the limits are (10 x 10 km, 60 s).
- `POST /predict` with `{{"bbox": [west, south, east, north], "year": "2018" or "2026"}}`
  returns the map.

Source code: https://github.com/Viranshul-P/terrascan (`api/` and `src/live.py`).
The first request after a quiet period is slow because free Spaces go to sleep.
"""


def build_space(cfg):
    """Copy the code, the Dockerfile and the README into out_dir (a fresh folder)."""
    out = Path(cfg["out_dir"])
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    ignore = shutil.ignore_patterns("__pycache__", "Dockerfile*")
    for name in cfg["copy_dirs"]:
        shutil.copytree(name, out / name, ignore=ignore)
    for name in cfg["copy_files"]:
        (out / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(name, out / name)
    shutil.copy2(cfg["requirements"], out / "api" / "requirements.txt")
    # Hugging Face builds the file called Dockerfile; the model repo and commit are its defaults.
    docker = Path(cfg["dockerfile"]).read_text(encoding="utf-8")
    docker = docker.replace(
        "ARG MODEL_REPO\nARG MODEL_REVISION\n",
        f"ARG MODEL_REPO={cfg['model_repo']}\nARG MODEL_REVISION={cfg['model_revision']}\n",
    )
    (out / "Dockerfile").write_text(docker, encoding="utf-8")
    (out / "README.md").write_text(HEADER.format(**cfg), encoding="utf-8")
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    print(f"Space folder: {build_space(cfg)}")


if __name__ == "__main__":
    main()
