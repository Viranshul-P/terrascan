"""Data helpers: list EuroSAT images, split them, and load them for training."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, Dataset
from torchvision.io import ImageReadMode, decode_image
from torchvision.transforms import v2

# Label number = position in this list (alphabetical, same as the folder names).
CLASSES = [
    "AnnualCrop",
    "Forest",
    "HerbaceousVegetation",
    "Highway",
    "Industrial",
    "Pasture",
    "PermanentCrop",
    "Residential",
    "River",
    "SeaLake",
]


def list_images(raw_dir):
    """Return a DataFrame with one row per image: path (relative to raw_dir) and label.

    EuroSAT RGB is laid out as EuroSAT_RGB/<ClassName>/<ClassName>_<n>.jpg,
    so the label is the name of the folder the image sits in.
    """
    raw_dir = Path(raw_dir)
    rows = []
    for jpg in sorted(raw_dir.glob("EuroSAT_RGB/*/*.jpg")):
        rows.append({"path": jpg.relative_to(raw_dir).as_posix(), "label": jpg.parent.name})
    return pd.DataFrame(rows, columns=["path", "label"])


def stratified_split(df, train_frac, val_frac, seed):
    """Split df into (train, val, test) so every class keeps the same proportions.

    For each class: shuffle its rows with a seeded RNG, then cut the first
    train_frac for train, the next val_frac for val, and the rest for test.
    """
    rng = np.random.default_rng(seed)
    train_parts, val_parts, test_parts = [], [], []
    for label in sorted(df["label"].unique()):
        rows = df[df["label"] == label]
        rows = rows.iloc[rng.permutation(len(rows))]
        n_train = round(len(rows) * train_frac)
        n_val = round(len(rows) * val_frac)
        train_parts.append(rows.iloc[:n_train])
        val_parts.append(rows.iloc[n_train : n_train + n_val])
        test_parts.append(rows.iloc[n_train + n_val :])
    return (
        pd.concat(train_parts, ignore_index=True),
        pd.concat(val_parts, ignore_index=True),
        pd.concat(test_parts, ignore_index=True),
    )


def read_image(path):
    """Read a JPEG as a float tensor (3, H, W) with values in 0-1."""
    image = decode_image(str(path), mode=ImageReadMode.RGB)  # uint8, 0-255
    return image.float() / 255


def compute_stats(train_csv, raw_dir):
    """Mean and std of each colour channel over all train images (values in 0-1).

    Only the train split is used, so nothing about val/test leaks into training.
    """
    df = pd.read_csv(train_csv)
    total = torch.zeros(3, dtype=torch.float64)
    total_sq = torch.zeros(3, dtype=torch.float64)
    n_pixels = 0
    for rel_path in df["path"]:
        image = read_image(Path(raw_dir) / rel_path).double()
        total += image.sum(dim=(1, 2))
        total_sq += (image**2).sum(dim=(1, 2))
        n_pixels += image.shape[1] * image.shape[2]
    mean = total / n_pixels
    std = (total_sq / n_pixels - mean**2).sqrt()
    return {"mean": mean.tolist(), "std": std.tolist()}


class RandomRot90(torch.nn.Module):
    """Rotate by a random multiple of 90 degrees (0, 90, 180 or 270).

    Satellite images have no "up", so every rotation is a valid image.
    """

    def forward(self, image):
        k = int(torch.randint(0, 4, (1,)))
        return torch.rot90(image, k, dims=(1, 2))


def build_transforms(stats, train, image_size=64):
    """Train: flips, 90-degree rotations, light colour jitter, then normalise.
    Val/test: normalise only, so the same image always gives the same tensor.
    image_size other than 64: scale every image (train, val and test) up to that size
    with bilinear smoothing, after augmenting and before normalising (step 2.3).
    """
    steps = []
    if train:
        steps += [
            v2.RandomHorizontalFlip(),
            v2.RandomVerticalFlip(),
            RandomRot90(),
            v2.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1),
        ]
    if image_size != 64:
        steps.append(v2.Resize(image_size, interpolation=v2.InterpolationMode.BILINEAR))
    steps.append(v2.Normalize(mean=stats["mean"], std=stats["std"]))
    if len(steps) == 1:
        return steps[0]  # val/test at 64x64: just normalise
    return v2.Compose(steps)


class EuroSATDataset(Dataset):
    """Reads one split CSV (path, label) and returns (image tensor, label number)."""

    def __init__(self, csv_path, raw_dir, transform):
        self.df = pd.read_csv(csv_path)
        self.raw_dir = Path(raw_dir)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        row = self.df.iloc[i]
        image = read_image(self.raw_dir / row["path"])
        label = CLASSES.index(row["label"])
        return self.transform(image), label


def build_dataloaders(cfg, image_size=64, norm_stats=None):
    """Return (train, val, test) DataLoaders built from the data config.

    Only train is shuffled and augmented.
    image_size: size the model sees (64 = no resizing).
    norm_stats: {"mean": [...], "std": [...]} to normalise with;
        None = our train-only data/stats.json.
    """
    stats = norm_stats or json.loads(Path(cfg["stats_path"]).read_text())
    loaders = []
    for name in ["train", "val", "test"]:
        is_train = name == "train"
        dataset = EuroSATDataset(
            Path(cfg["splits_dir"]) / f"{name}.csv",
            cfg["raw_dir"],
            build_transforms(stats, train=is_train, image_size=image_size),
        )
        loaders.append(
            DataLoader(
                dataset,
                batch_size=cfg["batch_size"],
                shuffle=is_train,
                num_workers=cfg["num_workers"],
                # keep the worker processes alive between epochs; on Windows starting them
                # takes several seconds, every epoch, for each loader
                persistent_workers=cfg["num_workers"] > 0,
            )
        )
    return tuple(loaders)
