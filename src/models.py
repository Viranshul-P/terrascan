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


def conv_block(in_channels, out_channels):
    """One block: find patterns, steady the numbers, keep the positives, halve the size."""
    return nn.Sequential(
        # 3x3 filters slide over the image; padding=1 keeps height and width the same
        nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
        # rescale each channel to a steady range so training is stable
        nn.BatchNorm2d(out_channels),
        # set negative values to 0, keep positive values
        nn.ReLU(),
        # keep the biggest value in each 2x2 square: height and width are halved
        nn.MaxPool2d(kernel_size=2),
    )


class SmallCNN(nn.Module):
    """Small CNN built from scratch: 3 conv blocks, then a classifier.

    Shapes for one image:
    (3, 64, 64) -> block1 -> (32, 32, 32) -> block2 -> (64, 16, 16) -> block3 -> (128, 8, 8)
    -> flatten -> 8192 numbers -> dropout -> linear -> 10 class scores
    """

    def __init__(self, num_classes=10, dropout=0.3):
        super().__init__()
        self.block1 = conv_block(3, 32)  # 3 colour channels -> 32 feature maps, 64x64 -> 32x32
        self.block2 = conv_block(32, 64)  # 32 -> 64 feature maps, 32x32 -> 16x16
        self.block3 = conv_block(64, 128)  # 64 -> 128 feature maps, 16x16 -> 8x8
        self.flatten = nn.Flatten()  # (128, 8, 8) -> one row of 128*8*8 = 8192 numbers
        self.dropout = nn.Dropout(dropout)  # in training, randomly zero 30% of those numbers
        self.classifier = nn.Linear(128 * 8 * 8, num_classes)  # 8192 numbers -> 10 class scores

    def forward(self, x):
        x = self.block1(x)  # (B, 3, 64, 64) -> (B, 32, 32, 32)
        x = self.block2(x)  # -> (B, 64, 16, 16)
        x = self.block3(x)  # -> (B, 128, 8, 8)
        x = self.flatten(x)  # -> (B, 8192)
        x = self.dropout(x)  # same shape; only active during training
        return self.classifier(x)  # -> (B, 10)


def count_parameters(model):
    """Number of trainable numbers (weights and biases) in the model."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def build_model(name):
    if name == "tiny":
        return TinyNet()
    if name == "small_cnn":
        return SmallCNN()
    raise ValueError(f"Unknown model: {name}")
