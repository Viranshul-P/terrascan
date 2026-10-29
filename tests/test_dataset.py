"""Checks on the Dataset, transforms and DataLoaders.

Tests that need the real images skip when data/raw/ is missing (e.g. in CI).
"""

import json
from pathlib import Path

import pytest
import torch
import yaml

from src.data import CLASSES, build_dataloaders, build_transforms

ROOT = Path(__file__).resolve().parents[1]
CFG = yaml.safe_load(open(ROOT / "configs" / "data.yaml"))
CFG["raw_dir"] = str(ROOT / CFG["raw_dir"])
CFG["splits_dir"] = str(ROOT / CFG["splits_dir"])
CFG["stats_path"] = str(ROOT / CFG["stats_path"])
CFG["num_workers"] = 0  # keep tests simple and fast

needs_images = pytest.mark.skipif(
    not (Path(CFG["raw_dir"]) / "EuroSAT_RGB").exists(),
    reason="EuroSAT images not downloaded (run scripts/download_eurosat.py)",
)


def load_stats():
    return json.loads(Path(CFG["stats_path"]).read_text())


def test_ten_classes():
    assert len(CLASSES) == 10
    assert CLASSES == sorted(CLASSES)


def test_stats_look_sane():
    stats = load_stats()
    for key in ["mean", "std"]:
        assert len(stats[key]) == 3
        assert all(0 < v < 1 for v in stats[key])


def test_val_transform_is_deterministic():
    transform = build_transforms(load_stats(), train=False)
    image = torch.rand(3, 64, 64)
    assert torch.equal(transform(image), transform(image))


def test_train_transform_keeps_shape():
    transform = build_transforms(load_stats(), train=True)
    assert transform(torch.rand(3, 64, 64)).shape == (3, 64, 64)


def test_resize_to_image_size():
    for train in [True, False]:
        transform = build_transforms(load_stats(), train=train, image_size=128)
        assert transform(torch.rand(3, 64, 64)).shape == (3, 128, 128)


def test_resnet18_config_uses_imagenet_stats():
    # the mean/std typed in the config must match what torchvision ships with the weights
    from torchvision.models import ResNet18_Weights

    cfg = yaml.safe_load(open(ROOT / "configs" / "resnet18.yaml"))
    expected = ResNet18_Weights.IMAGENET1K_V1.transforms()
    assert cfg["norm_stats"]["mean"] == list(expected.mean)
    assert cfg["norm_stats"]["std"] == list(expected.std)


@needs_images
def test_batches_have_right_shape_and_labels():
    for loader in build_dataloaders(CFG):
        images, labels = next(iter(loader))
        assert images.shape == (CFG["batch_size"], 3, 64, 64)
        assert labels.min() >= 0 and labels.max() <= 9


@needs_images
def test_val_and_test_loaders_are_deterministic():
    _, val_loader, test_loader = build_dataloaders(CFG)
    for loader in [val_loader, test_loader]:
        first, _ = next(iter(loader))
        second, _ = next(iter(loader))
        assert torch.equal(first, second)
