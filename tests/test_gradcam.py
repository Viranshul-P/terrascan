import torch
from torch import nn

from src.gradcam import gradcam_maps, pick_examples


def test_pick_examples_splits_correct_and_wrong():
    labels = torch.tensor([0, 1, 2, 3, 0, 1, 2, 3])
    preds = torch.tensor([0, 1, 2, 3, 1, 2, 3, 0])  # first 4 right, last 4 wrong
    correct, wrong = pick_examples(preds, labels, n=2, seed=42)
    assert len(correct) == 2 and len(wrong) == 2
    assert all(preds[i] == labels[i] for i in correct)
    assert all(preds[i] != labels[i] for i in wrong)
    assert pick_examples(preds, labels, n=2, seed=42) == (correct, wrong)  # same seed, same picks


def test_gradcam_maps_shape_and_not_flat():
    torch.manual_seed(0)
    conv = nn.Conv2d(3, 8, 3, padding=1)
    model = nn.Sequential(conv, nn.ReLU(), nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(8, 4))
    images = torch.randn(2, 3, 16, 16)
    maps = gradcam_maps(model.eval(), conv, images, classes=[0, 1])
    assert maps.shape == (2, 16, 16)
    assert maps.min() >= 0 and maps.max() <= 1
    assert maps[0].std() > 0  # a real heatmap, not one flat value
