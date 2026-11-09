"""Which input scaling suits the 13-band satellite ResNet-18 (SENTINEL2_ALL_MOCO)?
(step 8.3b, arm B)

Same idea as scripts/check_sat_scaling.py (2.4b): the first BatchNorm layer stores the average
and spread of what the first conv layer produced during pretraining. Feed EuroSAT_MS TRAIN
images with each candidate scaling through the pretrained first conv layer; the candidate
closest to the stored values wins. No val or test images are used.

Run from the repo root:
    python scripts/check_sat_ms_scaling.py
Saves results/bands_sat_scaling_check.txt
"""

import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import yaml
from torchgeo.models import ResNet18_Weights, resnet18

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.check_sat_scaling import gap_to_pretraining  # noqa: E402
from src.bands_train import Context  # noqa: E402

OUT = Path("results/bands_sat_scaling_check.txt")
N_IMAGES = 512


def main():
    torch.manual_seed(42)
    cfg = yaml.safe_load(open("configs/bands_compare.yaml", encoding="utf-8"))
    ctx = Context(cfg)
    spec = cfg["runs"]["sat_all"]
    names = spec["channels"]
    model = resnet18(weights=ResNet18_Weights.SENTINEL2_ALL_MOCO).eval()

    dataset = ctx.eurosat_ds(spec, "train", False)  # standardised channels in torchgeo order
    rng = np.random.default_rng(42)
    picks = rng.choice(len(dataset), size=N_IMAGES, replace=False)
    z = torch.stack([dataset[int(i)][0] for i in picks])
    array = np.load(ctx.array_path, mmap_mode="r")
    rows = [dataset.rows[int(i)] for i in picks]
    all_bands = ctx.bands["all_bands"]
    raw = torch.from_numpy(
        np.stack([np.asarray(array[r])[[all_bands.index(n) for n in names]] for r in rows])
    ).float()

    def up(x):
        return F.interpolate(x, size=(128, 128), mode="bilinear", align_corners=False)

    mean = torch.tensor([cfg["ssl4eo_stats"][n][0] for n in names]).view(1, -1, 1, 1)
    std = torch.tensor([cfg["ssl4eo_stats"][n][1] for n in names]).view(1, -1, 1, 1)
    candidates = {
        "raw EuroSAT_MS digital numbers / 10000": up(raw / 10000),
        "standardised only (mean 0, std 1)": up(z),
        "standardised, rescaled to SSL4EO-S12 band stats / 10000 (config rule)": up(z)
        * (std / 10000)
        + (mean / 10000),
    }
    lines = [
        "conv1 outputs vs what bn1 stored during pretraining, averaged over channels",
        "mean gap: in std units, 0 = same mean | spread factor: 1.00 = same spread",
        f"SENTINEL2_ALL_MOCO, {N_IMAGES} EuroSAT_MS train images, 128x128, seed 42",
    ]
    for name, images in candidates.items():
        mean_gap, spread_factor = gap_to_pretraining(model, images)
        lines.append(f"{name}: mean gap {mean_gap:.3f} | spread factor {spread_factor:.2f}")
    text = "\n".join(lines) + "\n"
    print(text)
    OUT.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
