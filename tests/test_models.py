"""Checks on model shapes and parameter counts."""

import torch

from src.models import SmallCNN, build_model, count_parameters


def test_small_cnn_output_shape():
    model = build_model("small_cnn")
    out = model(torch.randn(4, 3, 64, 64))
    assert out.shape == (4, 10)


def test_small_cnn_parameter_count():
    # Each block: conv (in*out*3*3 weights + out biases) + batchnorm (2*out learned numbers)
    def block(c_in, c_out):
        return c_in * c_out * 3 * 3 + c_out + 2 * c_out

    expected = block(3, 32) + block(32, 64) + block(64, 128) + (128 * 8 * 8 * 10 + 10)
    assert count_parameters(SmallCNN()) == expected


def test_eval_mode_is_deterministic():
    model = SmallCNN().eval()
    x = torch.randn(2, 3, 64, 64)
    assert torch.equal(model(x), model(x))  # eval mode: no dropout, same answer every time
