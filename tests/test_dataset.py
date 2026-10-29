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


def test_efficientnet_b0_config_uses_timm_stats():
    # the mean/std typed in the config must match what timm lists for these weights
    import timm

    cfg = yaml.safe_load(open(ROOT / "configs" / "efficientnet_b0.yaml"))
    model = timm.create_model(cfg["model_args"]["weights"], pretrained=False)
    assert cfg["norm_stats"]["mean"] == list(model.pretrained_cfg["mean"])
    assert cfg["norm_stats"]["std"] == list(model.pretrained_cfg["std"])


def test_rescale_to_target_stats():
    # a standardised image (mean 0, std 1) should come out with the target mean and std
    target = {"mean": [0.1, 0.2, 0.3], "std": [0.01, 0.02, 0.03]}
    transform = build_transforms(load_stats(), train=False, image_size=128, target_stats=target)
    stats = load_stats()
    mean = torch.tensor(stats["mean"]).view(3, 1, 1)
    std = torch.tensor(stats["std"]).view(3, 1, 1)
    image = torch.randn(3, 64, 64) * std + mean  # an image with roughly our stats
    out = transform(image)
    assert out.shape == (3, 128, 128)
    assert torch.allclose(out.mean(dim=(1, 2)), torch.tensor(target["mean"]), atol=0.01)


def test_resnet18_sat_config_uses_ssl4eo_band_stats():
    # target_stats must be torchgeo's SSL4EO-S12 band stats for B4, B3, B2, divided by 10000
    from torchgeo.models import resnet

    cfg = yaml.safe_load(open(ROOT / "configs" / "resnet18_sat.yaml"))
    bands = resnet._sentinel2_toa_bands
    for i, band in enumerate(resnet._sentinel2_rgb_bands):
        j = bands.index(band)
        assert cfg["target_stats"]["mean"][i] == pytest.approx(resnet._mean_s2[j] / 10000)
        assert cfg["target_stats"]["std"][i] == pytest.approx(resnet._std_s2[j] / 10000)


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
