"""Models. Every model takes images (B, 3, 64, 64) and returns 10 class scores (B, 10)."""

from torch import nn


class TinyNet(nn.Module):
    """One Linear layer on the flattened image. Only used to test the training loop."""

    def __init__(self, num_classes=10):
        super().__init__()
        self.flatten = nn.Flatten()
        self.linear = nn.Linear(3 * 64 * 64, num_classes)

    def forward(self, x):
        return self.linear(self.flatten(x))


def build_model(name):
    if name == "tiny":
        return TinyNet()
    raise ValueError(f"Unknown model: {name}")
