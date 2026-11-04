"""Run the exported ONNX model (step 5.1) on 64x64 RGB patches, with numpy only (step 5.2).

No PyTorch here on purpose: the API container (5.2b) only needs numpy and onnxruntime.
The scaling must match training exactly (src/data.py build_transforms, val/test path):
  1. pixel values 0-255 -> 0-1
  2. scale 64x64 up to info["image_size"] with bilinear smoothing (same maths as torchvision)
  3. (x - mean) / std per colour
A test checks this against build_transforms.
"""

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort


def load_model(onnx_path, info_path):
    """The ONNX session and its onnx_info.json (image size, mean/std, class names)."""
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    info = json.loads(Path(info_path).read_text(encoding="utf-8"))
    return session, info


def resize_weights(n_in, n_out):
    """For each output position: the two input positions to mix and the weight of the second.

    Same rule as torch bilinear with align_corners=False: pixel centres line up, and positions
    before the first pixel are clamped to it.
    """
    src = (np.arange(n_out) + 0.5) * n_in / n_out - 0.5
    src = np.clip(src, 0, None)
    i0 = np.floor(src).astype(int)
    i1 = np.minimum(i0 + 1, n_in - 1)
    return i0, i1, (src - i0).astype(np.float32)


def bilinear_resize(images, size):
    """(N, C, H, W) float32 -> (N, C, size, size), bilinear."""
    r0, r1, wr = resize_weights(images.shape[2], size)
    c0, c1, wc = resize_weights(images.shape[3], size)
    rows = images[:, :, r0, :] * (1 - wr)[:, None] + images[:, :, r1, :] * wr[:, None]
    return rows[:, :, :, c0] * (1 - wc) + rows[:, :, :, c1] * wc


def preprocess(patches, info):
    """uint8 patches (N, 64, 64, 3) -> float32 model input (N, 3, S, S), scaled as in training."""
    images = patches.astype(np.float32).transpose(0, 3, 1, 2) / 255
    if info["image_size"] != images.shape[2]:
        images = bilinear_resize(images, info["image_size"])
    mean = np.array(info["mean"], dtype=np.float32)[None, :, None, None]
    std = np.array(info["std"], dtype=np.float32)[None, :, None, None]
    return ((images - mean) / std).astype(np.float32)


def softmax(logits):
    e = np.exp(logits - logits.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def predict(session, info, patches, batch_size=64):
    """Class number and confidence (top softmax probability) for each patch."""
    classes, confidence = [], []
    for start in range(0, len(patches), batch_size):
        x = preprocess(np.asarray(patches[start:start + batch_size]), info)
        probs = softmax(session.run(["logits"], {"image": x})[0])
        classes.append(probs.argmax(axis=1))
        confidence.append(probs.max(axis=1))
    if not classes:
        return np.zeros(0, dtype=int), np.zeros(0, dtype=np.float32)
    return np.concatenate(classes), np.concatenate(confidence)
