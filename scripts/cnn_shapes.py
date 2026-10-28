"""See what one CNN block does to ONE real EuroSAT image.

Passes a River image through conv -> batchnorm -> ReLU -> maxpool, one layer at a time,
prints the shape after each, and saves feature maps to reports/figures/feature_maps.png.
The filters are random (untrained), so the maps show what random filters pick up.

Run from the repo root: python scripts/cnn_shapes.py
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save to files, no window
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
import yaml  # noqa: E402
from torch import nn  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import build_transforms, read_image  # noqa: E402

N_MAPS = 8  # how many of the 32 channels to draw


def main():
    torch.manual_seed(42)  # the conv filters start random; fix them so the figure is repeatable
    cfg = yaml.safe_load(open("configs/data.yaml", encoding="utf-8"))
    stats = json.loads(Path(cfg["stats_path"]).read_text(encoding="utf-8"))
    train = pd.read_csv(Path(cfg["splits_dir"]) / "train.csv")
    path = train[train["label"] == "River"]["path"].iloc[0]

    image = read_image(Path(cfg["raw_dir"]) / path)  # (3, 64, 64), values 0-1
    x = build_transforms(stats, train=False)(image).unsqueeze(0)  # add batch dim -> (1, 3, 64, 64)
    print(f"Image: {path}")
    print(f"input        {tuple(x.shape)}   (batch, channels, height, width)")

    conv = nn.Conv2d(in_channels=3, out_channels=32, kernel_size=3, padding=1)
    bn = nn.BatchNorm2d(32)
    relu = nn.ReLU()
    pool = nn.MaxPool2d(kernel_size=2)

    with torch.no_grad():
        after_conv = conv(x)
        print(f"conv         {tuple(after_conv.shape)}  32 filters, each 3x3x3 -> 32 feature maps")
        after_bn = bn(after_conv)
        print(f"batchnorm    {tuple(after_bn.shape)}  same shape, each channel rescaled")
        after_relu = relu(after_bn)
        print(f"relu         {tuple(after_relu.shape)}  same shape, negatives set to 0")
        after_pool = pool(after_relu)
        print(f"maxpool      {tuple(after_pool.shape)}  max of each 2x2 square -> half size")

    n_params = sum(p.numel() for p in conv.parameters())
    print(f"conv parameters: {n_params} (32 filters x 3x3x3 weights + 32 biases)")
    frac_zero = (after_relu == 0).float().mean().item()
    print(f"share of values set to 0 by ReLU: {frac_zero:.2f}")

    rows = [("after conv", after_conv), ("after ReLU", after_relu), ("after maxpool", after_pool)]
    fig, axes = plt.subplots(len(rows), N_MAPS + 1, figsize=((N_MAPS + 1) * 1.3, 4.6))
    for r, (name, maps) in enumerate(rows):
        axes[r, 0].imshow(image.permute(1, 2, 0).numpy())
        size = maps.shape[-1]
        axes[r, 0].set_ylabel(f"{name}\n{size}x{size}", fontsize=9)
        for c in range(N_MAPS):
            axes[r, c + 1].imshow(maps[0, c].numpy(), cmap="gray")
            if r == 0:
                axes[r, c + 1].set_title(f"filter {c}", fontsize=8)
    for ax in axes.flat:
        ax.set_xticks([])
        ax.set_yticks([])
    axes[0, 0].set_title("input", fontsize=8)
    fig.suptitle("One CNN block on a River image (random, untrained filters)")
    fig.tight_layout()
    out = Path("reports/figures/feature_maps.png")
    fig.savefig(out, dpi=150)
    plt.close(fig)
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
