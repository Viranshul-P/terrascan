"""Export the India fine-tuned model to ONNX (step 5.1).

Run from the repo root:
    python -m src.export_onnx --config configs/export_onnx.yaml

ONNX is a standard model file. The API (step 5.2) runs it with onnxruntime, so it does
not need PyTorch. Next to model.onnx we save onnx_info.json: the image size, the scaling
(mean/std) and the class names, which the API must use exactly as in training.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import yaml

from src.data import CLASSES, build_transforms, read_image
from src.evaluate import load_run
from src.india_eval import load_labels, split_by_area


def export(model, image_size, onnx_path, opset_version=17):
    """Write the model to onnx_path. The batch size can be anything (dynamic axis 0)."""
    model.eval()
    dummy = torch.zeros(1, 3, image_size, image_size)
    torch.onnx.export(
        model,
        (dummy,),
        str(onnx_path),
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=opset_version,
        dynamo=False,  # the older exporter: needs no extra package (onnxscript)
    )


def onnx_logits(onnx_path, images):
    """Run the ONNX file on a float32 numpy batch (N, 3, H, W); returns the logits."""
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    return session.run(["logits"], {"image": images})[0]


def check_images(cfg, run_cfg):
    """The first N Indian test patches, scaled exactly as in training. Returns (N, 3, H, W)."""
    eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))
    df = load_labels(eval_cfg["reviewed_csv"])
    _, test_df = split_by_area(df, eval_cfg["test_areas"], eval_cfg["finetune_areas"])
    stats = run_cfg["norm_stats"]
    tf = build_transforms(stats, False, run_cfg["image_size"], run_cfg.get("target_stats"))
    files = test_df["file"].iloc[: cfg["check_images"]]
    return torch.stack([tf(read_image(Path(eval_cfg["patches_dir"]) / f)) for f in files])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))

    model, run_cfg = load_run(cfg["run_dir"])
    export(model, run_cfg["image_size"], cfg["onnx_path"], cfg["opset_version"])
    print(f"Saved {cfg['onnx_path']}")

    info = {
        "source_weights": str(Path(cfg["run_dir"]) / "best.pt"),
        "image_size": run_cfg["image_size"],
        "mean": run_cfg["norm_stats"]["mean"],
        "std": run_cfg["norm_stats"]["std"],
        "target_stats": run_cfg.get("target_stats"),
        "classes": CLASSES,
        "input": "image: float32 (batch, 3, H, W), RGB 0-1 then (x - mean) / std",
        "output": "logits: float32 (batch, 10); softmax gives class probabilities",
    }
    Path(cfg["info_path"]).write_text(json.dumps(info, indent=2), encoding="utf-8")
    print(f"Saved {cfg['info_path']}")

    images = check_images(cfg, run_cfg)
    with torch.no_grad():
        torch_out = model(images).numpy()
    diff = float(np.abs(torch_out - onnx_logits(cfg["onnx_path"], images.numpy())).max())
    print(f"Largest PyTorch-vs-ONNX difference on {len(images)} patches: {diff:.2e}")
    check = {
        "onnx_path": cfg["onnx_path"],
        "n_images": len(images),
        "images": "first Indian TEST patches (configs/india_eval.yaml), no scores computed",
        "max_abs_logit_difference": diff,
        "tolerance": cfg["tolerance"],
        "passed": diff < cfg["tolerance"],
    }
    Path(cfg["check_path"]).write_text(json.dumps(check, indent=2), encoding="utf-8")
    print(f"Saved {cfg['check_path']}")


if __name__ == "__main__":
    main()
