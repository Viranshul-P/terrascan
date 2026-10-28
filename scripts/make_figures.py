"""Save the README figures for the EuroSAT data to reports/figures/.

- class_balance.png: number of images per class in train / val / test
- samples_per_class.png: 5 random train images for each class
- augmented_samples.png: a few train images, each with 5 augmented versions

Run from the repo root: python scripts/make_figures.py
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save to files, no window
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
import yaml  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import CLASSES, build_transforms, read_image  # noqa: E402

OUT_DIR = Path("reports/figures")
N_PER_CLASS = 5
N_AUGMENTED = 5


def plot_class_balance(splits):
    x = np.arange(len(CLASSES))
    width = 0.27
    fig, ax = plt.subplots(figsize=(10, 4.5))
    for i, (name, df) in enumerate(splits.items()):
        counts = df["label"].value_counts().reindex(CLASSES)
        ax.bar(x + (i - 1) * width, counts.values, width, label=name)
    ax.set_xticks(x)
    ax.set_xticklabels(CLASSES, rotation=30, ha="right")
    ax.set_ylabel("Number of images")
    ax.set_title("EuroSAT RGB: images per class in each split")
    ax.legend()
    fig.tight_layout()
    fig.savefig(OUT_DIR / "class_balance.png", dpi=150)
    plt.close(fig)


def plot_samples_per_class(train, raw_dir, rng):
    fig, axes = plt.subplots(len(CLASSES), N_PER_CLASS, figsize=(N_PER_CLASS * 1.4, 14))
    for row, label in enumerate(CLASSES):
        paths = train[train["label"] == label]["path"].to_numpy()
        for col, path in enumerate(rng.choice(paths, N_PER_CLASS, replace=False)):
            ax = axes[row, col]
            ax.imshow(read_image(raw_dir / path).permute(1, 2, 0).numpy())
            ax.set_xticks([])
            ax.set_yticks([])
        axes[row, 0].set_ylabel(label, rotation=0, ha="right", va="center", fontsize=9)
    fig.suptitle("EuroSAT RGB: 5 random train images per class")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "samples_per_class.png", dpi=150)
    plt.close(fig)


def plot_augmented_samples(train, raw_dir, stats, rng):
    transform = build_transforms(stats, train=True)
    mean = torch.tensor(stats["mean"]).view(3, 1, 1)
    std = torch.tensor(stats["std"]).view(3, 1, 1)
    labels = rng.choice(CLASSES, N_PER_CLASS, replace=False)
    fig, axes = plt.subplots(len(labels), N_AUGMENTED + 1, figsize=((N_AUGMENTED + 1) * 1.4, 8))
    for row, label in enumerate(labels):
        path = rng.choice(train[train["label"] == label]["path"].to_numpy())
        image = read_image(raw_dir / path)
        shown = [image]
        for _ in range(N_AUGMENTED):
            # Undo the normalisation so the colours look normal again
            shown.append((transform(image) * std + mean).clamp(0, 1))
        for col, picture in enumerate(shown):
            ax = axes[row, col]
            ax.imshow(picture.permute(1, 2, 0).numpy())
            ax.set_xticks([])
            ax.set_yticks([])
        axes[row, 0].set_ylabel(label, rotation=0, ha="right", va="center", fontsize=9)
    axes[0, 0].set_title("original", fontsize=9)
    for col in range(1, N_AUGMENTED + 1):
        axes[0, col].set_title(f"augmented {col}", fontsize=9)
    fig.suptitle("Train augmentations: flips, 90° rotations, light colour jitter")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "augmented_samples.png", dpi=150)
    plt.close(fig)


def main():
    cfg = yaml.safe_load(open("configs/data.yaml"))
    seed = cfg["seed"]
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)  # the augmentations use torch's random numbers

    raw_dir = Path(cfg["raw_dir"])
    splits = {n: pd.read_csv(Path(cfg["splits_dir"]) / f"{n}.csv") for n in ["train", "val", "test"]}
    stats = json.loads(Path(cfg["stats_path"]).read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    plot_class_balance(splits)
    plot_samples_per_class(splits["train"], raw_dir, rng)
    plot_augmented_samples(splits["train"], raw_dir, stats, rng)
    for name in ["class_balance", "samples_per_class", "augmented_samples"]:
        print(f"Saved {OUT_DIR / name}.png")


if __name__ == "__main__":
    main()
