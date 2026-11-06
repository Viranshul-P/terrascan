"""Data for the website's "You vs the model" game (step 5.3a, prototype E).

Takes the 81 Indian TEST squares (labels from step 4.2, areas from step 4.3), runs the
fine-tuned ONNX model on them, and writes two files for the website:
  quiz.json    one entry per square: the label, the model's answer and how sure it was
  squares.webp all 81 squares in one picture (a sprite sheet): one image instead of 81
Before writing, it checks that the model's accuracy here equals the saved test result
(results/india_after.json).
"""

import argparse
import json
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

from src.classes import CLASSES
from src.india_eval import load_labels, split_by_area
from src.onnx_predict import load_model, predict


def sprite_position(i, cols, size=64):
    """Top-left pixel (x, y) of square number i in the sprite sheet."""
    return (i % cols) * size, (i // cols) * size


def make_sprite(images, cols, size=64):
    """Paste equal-size RGB images into one sheet, row by row."""
    rows = -(-len(images) // cols)  # ceiling division
    sheet = Image.new("RGB", (cols * size, rows * size))
    for i, img in enumerate(images):
        sheet.paste(img, sprite_position(i, cols, size))
    return sheet


def read_key(data, dotted):
    """data["a"]["b"]["c"] for dotted = "a.b.c"."""
    for part in dotted.split("."):
        data = data[part]
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))

    df = load_labels(cfg["reviewed_csv"])
    _, test = split_by_area(df, cfg["test_areas"], cfg["finetune_areas"])
    images = [Image.open(Path(cfg["patches_dir"]) / f).convert("RGB") for f in test["file"]]
    session, info = load_model(cfg["onnx_path"], cfg["onnx_info_path"])
    preds, conf = predict(session, info, np.stack([np.asarray(im) for im in images]))

    labels = [CLASSES.index(x) for x in test["final_label"]]
    acc = float(np.mean(preds == np.array(labels)))
    saved = json.loads(Path(cfg["expected_result"]).read_text(encoding="utf-8"))
    expected = read_key(saved, cfg["expected_key"])
    print(f"{len(test)} test squares, model accuracy {acc:.4f} (saved result: {expected:.4f})")
    # Same 81 squares, same model: the ONNX copy must score the same as the PyTorch run (4.4).
    assert abs(acc - expected) < 1e-9, "ONNX accuracy differs from the saved result; stopping"

    out = Path(cfg["out_dir"])
    out.mkdir(parents=True, exist_ok=True)
    sheet = make_sprite(images, cfg["sprite_cols"])
    sheet.save(out / "squares.webp", quality=cfg["sprite_quality"])
    quiz = {
        "made_by": "src/quiz.py with configs/quiz.yaml",
        "about": "Indian TEST squares (areas never used for training). Labels: Claude first, "
        "every one reviewed by the author (step 4.2). Model: fine-tuned EfficientNet-B0, "
        "seed 42 (ONNX).",
        "model_accuracy": acc,
        "model_accuracy_source": f"{cfg['expected_result']} {cfg['expected_key']}",
        "sprite": {"file": "squares.webp", "cols": cfg["sprite_cols"], "size": 64},
        "squares": [
            {
                "i": i,
                "area": area,
                "label": label,
                "model": CLASSES[int(p)],
                "confidence": round(float(c), 4),
            }
            for i, (area, label, p, c) in enumerate(
                zip(test["area"], test["final_label"], preds, conf)
            )
        ],
    }
    (out / "quiz.json").write_text(json.dumps(quiz, indent=1), encoding="utf-8")
    print(f"wrote {out / 'quiz.json'} and {out / 'squares.webp'}")


if __name__ == "__main__":
    main()
