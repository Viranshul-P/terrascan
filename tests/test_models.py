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


def test_small_cnn_options_keep_output_shape():
    for args in [{"head": "avgpool"}, {"convs": 2}, {"widths": [64, 128, 256]}]:
        out = build_model("small_cnn", args)(torch.randn(2, 3, 64, 64))
        assert out.shape == (2, 10), args


def test_avgpool_head_parameter_count():
    # Same blocks as v1, but the classifier sees 128 averaged numbers instead of 8192
    def block(c_in, c_out):
        return c_in * c_out * 3 * 3 + c_out + 2 * c_out

    expected = block(3, 32) + block(32, 64) + block(64, 128) + (128 * 10 + 10)
    assert count_parameters(SmallCNN(head="avgpool")) == expected


def test_default_options_match_v1_weight_names():
    # v1 weights (models/small_cnn_v1) must still load into the default SmallCNN
    names = set(SmallCNN().state_dict())
    assert "block1.0.weight" in names and "classifier.weight" in names
    assert not any(name.startswith("pool.") for name in names)


def test_eval_mode_is_deterministic():
    model = SmallCNN().eval()
    x = torch.randn(2, 3, 64, 64)
    assert torch.equal(model(x), model(x))  # eval mode: no dropout, same answer every time
