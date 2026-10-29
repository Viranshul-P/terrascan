"""Models. Every model takes images (B, 3, H, W) and returns 10 class scores (B, 10).

SmallCNN expects 64x64. ResNet-18 and EfficientNet-B0 work on any size
(steps 2.3 and 2.4 use 128x128, see configs/resnet18.yaml).
"""

import timm
from torch import nn
from torchvision.models import ResNet18_Weights, resnet18


class TinyNet(nn.Module):
    """One Linear layer on the flattened image. Only used to test the training loop."""

    def __init__(self, num_classes=10):
        super().__init__()
        self.flatten = nn.Flatten()
        self.linear = nn.Linear(3 * 64 * 64, num_classes)

    def forward(self, x):
        return self.linear(self.flatten(x))


def conv_block(in_channels, out_channels, convs=1):
    """One block: find patterns, steady the numbers, keep the positives, halve the size.

    convs = how many conv -> batchnorm -> ReLU layers come before the halving (v1 uses 1).
    """
    layers = []
    for i in range(convs):
        c_in = in_channels if i == 0 else out_channels  # later convs keep the same width
        # 3x3 filters slide over the image; padding=1 keeps height and width the same
        layers.append(nn.Conv2d(c_in, out_channels, kernel_size=3, padding=1))
        # rescale each channel to a steady range so training is stable
        layers.append(nn.BatchNorm2d(out_channels))
        # set negative values to 0, keep positive values
        layers.append(nn.ReLU())
    # keep the biggest value in each 2x2 square: height and width are halved
    layers.append(nn.MaxPool2d(kernel_size=2))
    return nn.Sequential(*layers)


class SmallCNN(nn.Module):
    """Small CNN built from scratch: 3 conv blocks, then a classifier.

    Shapes for one image with the v1 settings (widths 32, 64, 128):
    (3, 64, 64) -> block1 -> (32, 32, 32) -> block2 -> (64, 16, 16) -> block3 -> (128, 8, 8)
    -> flatten -> 8192 numbers -> dropout -> linear -> 10 class scores

    Options tried in step 2.2c (the defaults are v1):
    widths: feature maps made by each block. convs: conv layers per block.
    head: "flatten" keeps all 8x8 positions; "avgpool" averages each feature map to 1 number.
    """

    def __init__(self, num_classes=10, dropout=0.3, widths=(32, 64, 128), convs=1, head="flatten"):
        super().__init__()
        c1, c2, c3 = widths
        self.block1 = conv_block(3, c1, convs)  # 3 colour channels -> c1 maps, 64x64 -> 32x32
        self.block2 = conv_block(c1, c2, convs)  # c1 -> c2 feature maps, 32x32 -> 16x16
        self.block3 = conv_block(c2, c3, convs)  # c2 -> c3 feature maps, 16x16 -> 8x8
        if head == "flatten":
            self.pool = nn.Identity()  # keep all 8x8 positions
            features = c3 * 8 * 8  # v1: 128*8*8 = 8192 numbers
        elif head == "avgpool":
            self.pool = nn.AdaptiveAvgPool2d(1)  # average each 8x8 map down to 1 number
            features = c3  # v1 widths: 128 numbers
        else:
            raise ValueError(f"Unknown head: {head}")
        self.flatten = nn.Flatten()  # (c3, h, w) -> one row of c3*h*w numbers
        self.dropout = nn.Dropout(dropout)  # in training, randomly zero this share of the numbers
        self.classifier = nn.Linear(features, num_classes)  # those numbers -> 10 class scores

    def forward(self, x):
        x = self.block1(x)  # (B, 3, 64, 64) -> (B, c1, 32, 32)
        x = self.block2(x)  # -> (B, c2, 16, 16)
        x = self.block3(x)  # -> (B, c3, 8, 8)
        x = self.pool(x)  # flatten head: unchanged; avgpool head: -> (B, c3, 1, 1)
        x = self.flatten(x)  # -> (B, features)
        x = self.dropout(x)  # same shape; only active during training
        return self.classifier(x)  # -> (B, 10)


def build_resnet18(num_classes=10, pretrained=True):
    """ResNet-18 from torchvision. pretrained=True starts from ImageNet weights (downloaded once).

    Its last layer `fc` maps 512 numbers to 1000 ImageNet classes; we swap it for a new
    layer with 10 outputs (random start). All layers are trained (fine-tuned), not just fc.
    """
    weights = ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
    model = resnet18(weights=weights)
    model.fc = nn.Linear(model.fc.in_features, num_classes)  # 512 -> 10 class scores
    return model


def build_efficientnet_b0(num_classes=10, pretrained=True, weights="efficientnet_b0.ra_in1k"):
    """EfficientNet-B0 from timm. pretrained=True starts from the named ImageNet weights
    (downloaded once from Hugging Face). timm swaps the 1000-class last layer for a new
    layer with num_classes outputs itself. All layers are trained (fine-tuned).
    """
    return timm.create_model(weights, pretrained=pretrained, num_classes=num_classes)


def count_parameters(model):
    """Number of trainable numbers (weights and biases) in the model."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def build_model(name, model_args=None):
    """model_args: optional settings from the config's `model_args`, passed to the model."""
    model_args = model_args or {}
    if name == "tiny":
        return TinyNet(**model_args)
    if name == "small_cnn":
        return SmallCNN(**model_args)
    if name == "resnet18":
        return build_resnet18(**model_args)
    if name == "efficientnet_b0":
        return build_efficientnet_b0(**model_args)
    raise ValueError(f"Unknown model: {name}")
