"""Which input scaling suits the satellite-pretrained ResNet-18 (step 2.4b)?

The first BatchNorm layer (bn1) stores the average and spread of what the first conv layer
produced during pretraining. Feed TRAIN images with each candidate scaling through the
pretrained first conv layer and see which one gives outputs closest to those stored values.
No val or test images are used.

Run from the repo root:
    python scripts/check_sat_scaling.py
Saves results/resnet18_sat_scaling_check.txt
"""

import json
import sys
from pathlib import Path

import pandas as pd
import torch
import yaml
from torchgeo.models import ResNet18_Weights, resnet18
from torchvision.transforms import v2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import read_image  # noqa: E402

OUT = Path("results/resnet18_sat_scaling_check.txt")


def gap_to_pretraining(model, images):
    """Mean distance (in std units) between conv1 output means and bn1's stored means."""
    with torch.no_grad():
        out = model.conv1(images)
    stored_mean = model.bn1.running_mean
    stored_std = model.bn1.running_var.sqrt()
    return ((out.mean(dim=(0, 2, 3)) - stored_mean).abs() / stored_std).mean().item()


def main():
    torch.manual_seed(42)
    model = resnet18(weights=ResNet18_Weights.SENTINEL2_RGB_MOCO).eval()
    stats = json.loads(Path("data/stats.json").read_text())
    our_mean = torch.tensor(stats["mean"]).view(3, 1, 1)
    our_std = torch.tensor(stats["std"]).view(3, 1, 1)

    # 512 train images, scaled to 128x128 like in training, pixels in 0-1
    df = pd.read_csv("data/splits/train.csv").sample(512, random_state=42)
    resize = v2.Resize(128)
    x = torch.stack([resize(read_image(Path("data/raw") / p)) for p in df["path"]])
    z = (x - our_mean) / our_std  # standardised with our train stats

    def rescale(mean, std):  # give z a new per-channel mean and std
        return z * torch.tensor(std).view(3, 1, 1) + torch.tensor(mean).view(3, 1, 1)

    cfg = yaml.safe_load(open("configs/resnet18_sat.yaml", encoding="utf-8"))
    # B4, B3, B2 band stats in the SSL4EO authors' EuroSAT script (zhu-xlab/SSL4EO-S12,
    # src/benchmark/transfer_classification/datasets/EuroSat/eurosat_dataset.py), / 10000
    eurosat_script_mean = [946.554 / 1e4, 1041.8842963 / 1e4, 1117.20222222 / 1e4]
    eurosat_script_std = [620.02902871 / 1e4, 684.77615743 / 1e4, 736.01759721 / 1e4]
    candidates = {
        "JPEG / 255 as is": x,
        "authors' 8-bit stretch (mean +- 2 std -> 0-1)": (z * 0.25 + 0.5).clamp(0, 1),
        "rescale to band stats in authors' EuroSAT script / 10000": rescale(
            eurosat_script_mean, eurosat_script_std
        ),
        "rescale to SSL4EO-S12 band stats / 10000 (config)": rescale(
            cfg["target_stats"]["mean"], cfg["target_stats"]["std"]
        ),
    }
    lines = ["Gap between conv1 output means and bn1's stored means, in std units (lower = closer)"]
    lines.append("512 train images, 128x128, seed 42")
    for name, images in candidates.items():
        lines.append(f"{name}: {gap_to_pretraining(model, images):.3f}")
    text = "\n".join(lines) + "\n"
    print(text)
    OUT.write_text(text, encoding="utf-8")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
