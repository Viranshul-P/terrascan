"""Step 5.1: the ONNX file must give the same outputs as PyTorch."""

from pathlib import Path

import numpy as np
import pytest
import torch
import yaml

from src.evaluate import load_run
from src.export_onnx import check_images, export, onnx_logits
from src.models import SmallCNN

CONFIG = Path("configs/export_onnx.yaml")


def test_export_tiny_model_matches(tmp_path):
    """Runs everywhere (CI too): a small random model, exported and compared."""
    torch.manual_seed(42)
    model = SmallCNN(num_classes=10).eval()
    path = tmp_path / "tiny.onnx"
    export(model, 64, path)
    images = torch.rand(3, 3, 64, 64)  # batch of 3: checks the batch size is not fixed to 1
    with torch.no_grad():
        expected = model(images).numpy()
    got = onnx_logits(path, images.numpy())
    assert got.shape == (3, 10)
    assert np.abs(got - expected).max() < 1e-4


def test_real_model_matches_on_20_indian_test_patches(tmp_path):
    """The real check. Needs the git-ignored weights and patches, so it skips in CI."""
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))
    weights = Path(cfg["run_dir"]) / "best.pt"
    if not weights.exists() or not Path(eval_cfg["reviewed_csv"]).exists():
        pytest.skip("fine-tuned weights or Indian patches not on this machine")

    model, run_cfg = load_run(cfg["run_dir"])
    path = tmp_path / "model.onnx"
    export(model, run_cfg["image_size"], path, cfg["opset_version"])
    images = check_images(cfg, run_cfg)
    assert len(images) == 20
    with torch.no_grad():
        expected = model(images).numpy()
    got = onnx_logits(path, images.numpy())
    assert np.abs(got - expected).max() < cfg["tolerance"]
    assert (got.argmax(1) == expected.argmax(1)).all()
