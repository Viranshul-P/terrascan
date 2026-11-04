"""Step 5.2: numpy-only preprocessing must match training's torchvision transforms exactly."""

import numpy as np
import torch

from src.data import build_transforms
from src.export_onnx import export
from src.models import SmallCNN
from src.onnx_predict import load_model, predict, preprocess

IMAGENET = {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}


def test_preprocess_matches_build_transforms():
    rng = np.random.default_rng(42)
    patches = rng.integers(0, 256, size=(4, 64, 64, 3), dtype=np.uint8)
    info = {"image_size": 128, **IMAGENET}
    tf = build_transforms(IMAGENET, False, 128)
    expected = torch.stack(
        [tf(torch.from_numpy(p).permute(2, 0, 1).float() / 255) for p in patches]
    ).numpy()
    got = preprocess(patches, info)
    assert got.shape == (4, 3, 128, 128)
    assert got.dtype == np.float32
    assert np.abs(got - expected).max() < 1e-5


def test_preprocess_without_resize():
    patches = np.full((1, 64, 64, 3), 255, dtype=np.uint8)
    info = {"image_size": 64, "mean": [0.5] * 3, "std": [0.5] * 3}
    assert np.allclose(preprocess(patches, info), 1.0)


def test_predict_classes_and_confidence(tmp_path):
    torch.manual_seed(42)
    model = SmallCNN(num_classes=10).eval()
    onnx_path = tmp_path / "tiny.onnx"
    export(model, 64, onnx_path)
    info_path = tmp_path / "info.json"
    info_path.write_text('{"image_size": 64, "mean": [0.5, 0.5, 0.5], "std": [0.5, 0.5, 0.5]}')
    session, info = load_model(onnx_path, info_path)
    patches = np.random.default_rng(0).integers(0, 256, size=(5, 64, 64, 3), dtype=np.uint8)

    classes, confidence = predict(session, info, patches, batch_size=2)  # 3 batches: 2, 2, 1
    with torch.no_grad():
        probs = torch.softmax(model(torch.from_numpy(preprocess(patches, info))), dim=1).numpy()
    assert classes.tolist() == probs.argmax(axis=1).tolist()
    assert np.allclose(confidence, probs.max(axis=1), atol=1e-5)
    assert ((confidence > 0) & (confidence <= 1)).all()
