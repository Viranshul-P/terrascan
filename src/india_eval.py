"""Measure how much worse the EuroSAT models are on Indian patches (step 4.3).

Run from the repo root:
    python -m src.india_eval --config configs/india_eval.yaml

Nothing here trains or changes a model. The Indian test areas are only reported;
the choice of model for step 4.4 uses the fine-tune areas.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml

from src.confusion import pick_best_model
from src.data import CLASSES, build_transforms, read_image
from src.evaluate import load_run
from src.metrics import confusion_matrix, per_class_f1


def present_macro_f1(preds, labels):
    """Macro-F1 averaged only over classes that appear in the true labels.

    Classes with no patches at all (e.g. SeaLake in India) are left out, otherwise each would
    count as F1 = 0 and pull the average down for no reason. A wrong prediction of an absent
    class still hurts: it is a miss for the true class.
    """
    scores = per_class_f1(preds, labels, len(CLASSES))
    present = sorted(set(labels.tolist()))
    return float(np.mean([scores[c] for c in present]))


def accuracy(preds, labels):
    return (preds == labels).sum().item() / len(labels)


def bootstrap_range(preds, labels, score_fn, samples, seed):
    """95% range of a score: redraw the patches with replacement `samples` times,
    score each redraw, and take the 2.5th and 97.5th percentiles."""
    rng = np.random.default_rng(seed)
    n = len(labels)
    scores = []
    for _ in range(samples):
        idx = torch.from_numpy(rng.integers(0, n, size=n))
        scores.append(score_fn(preds[idx], labels[idx]))
    low, high = np.percentile(scores, [2.5, 97.5])
    return [float(low), float(high)]


def load_labels(reviewed_csv):
    """The user's final labels from step 4.2, skips removed."""
    df = pd.read_csv(reviewed_csv)
    return df[df["final_label"] != "skip"].reset_index(drop=True)


def split_by_area(df, test_areas, finetune_areas):
    """Return (fine-tune rows, test rows). Stops if an area is in both lists or in neither."""
    assert not set(test_areas) & set(finetune_areas), "an area is in both lists"
    unknown = set(df["area"]) - set(test_areas) - set(finetune_areas)
    assert not unknown, f"areas not assigned: {unknown}"
    finetune = df[df["area"].isin(finetune_areas)].reset_index(drop=True)
    test = df[df["area"].isin(test_areas)].reset_index(drop=True)
    return finetune, test


@torch.no_grad()
def predict_patches(model, cfg, df, patches_dir, device):
    """Predict every patch in df, with the same image size and scaling the run was trained with."""
    stats = cfg.get("norm_stats") or json.loads(
        Path(cfg["data"]["stats_path"]).read_text(encoding="utf-8")
    )
    transform = build_transforms(stats, False, cfg.get("image_size", 64), cfg.get("target_stats"))
    images = torch.stack([transform(read_image(Path(patches_dir) / f)) for f in df["file"]])
    labels = torch.tensor([CLASSES.index(name) for name in df["final_label"]])
    model.to(device).eval()
    preds = model(images.to(device)).argmax(dim=1).cpu()
    return preds, labels


def score(preds, labels, eval_cfg):
    """Accuracy and macro-F1 with bootstrap 95% ranges, per-class F1 + counts, confusion matrix."""
    samples, seed = eval_cfg["bootstrap_samples"], eval_cfg["bootstrap_seed"]
    f1s = per_class_f1(preds, labels, len(CLASSES))
    present = sorted(set(labels.tolist()))
    return {
        "n_patches": len(labels),
        "accuracy": accuracy(preds, labels),
        "accuracy_95_range": bootstrap_range(preds, labels, accuracy, samples, seed),
        "macro_f1": present_macro_f1(preds, labels),
        "macro_f1_95_range": bootstrap_range(preds, labels, present_macro_f1, samples, seed),
        "per_class": {
            CLASSES[c]: {
                "true_count": int((labels == c).sum()),
                "predicted_count": int((preds == c).sum()),
                "f1": f1s[c] if c in present else None,
            }
            for c in range(len(CLASSES))
        },
        "confusion_matrix": confusion_matrix(preds, labels, len(CLASSES)).tolist(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))

    df = load_labels(cfg["reviewed_csv"])
    finetune_df, test_df = split_by_area(df, cfg["test_areas"], cfg["finetune_areas"])
    print(f"{len(finetune_df)} fine-tune patches, {len(test_df)} test patches")

    imagenet, val_mean = pick_best_model(cfg["imagenet_candidates"], cfg["pick_seeds"])
    print(f"ImageNet model: {imagenet['name']} (mean EuroSAT val acc {val_mean:.4f})")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    out = {
        "test_areas": cfg["test_areas"],
        "finetune_areas": cfg["finetune_areas"],
        "seed": cfg["seed"],
        "imagenet_pick": {"name": imagenet["name"], "mean_eurosat_val_acc": val_mean},
        "models": {},
    }
    for entry in [imagenet, cfg["satellite_model"]]:
        model, run_cfg = load_run(Path(entry["run_dir"]) / f"seed{cfg['seed']}")
        result = {}
        for split_name, split_df in [("test", test_df), ("finetune", finetune_df)]:
            preds, labels = predict_patches(model, run_cfg, split_df, cfg["patches_dir"], device)
            result[split_name] = score(preds, labels, cfg)
        out["models"][entry["name"]] = result
        t = result["test"]
        print(
            f"{entry['name']}: test acc {t['accuracy']:.3f} {t['accuracy_95_range']}, "
            f"macro-F1 {t['macro_f1']:.3f} | fine-tune acc {result['finetune']['accuracy']:.3f}"
        )

    # Rule fixed in the config before any numbers were seen: higher FINE-TUNE accuracy goes on.
    best = max(out["models"], key=lambda name: out["models"][name]["finetune"]["accuracy"])
    out["model_for_4_4"] = {"name": best, "rule": "higher accuracy on the fine-tune areas"}
    print(f"Model for step 4.4: {best}")

    Path(cfg["output_path"]).write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved {cfg['output_path']}")


if __name__ == "__main__":
    main()
