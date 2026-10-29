"""Evaluate saved models on the TEST split and save results/<model>.json (step 2.5).

This is the only place Phase 2 uses the test split. Nothing here changes a model or a setting.

Run from the repo root:
    python -m src.evaluate --config configs/evaluate.yaml
"""

import argparse
import json
import statistics
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save PNGs without opening a window
import matplotlib.pyplot as plt  # noqa: E402
import torch  # noqa: E402
import yaml  # noqa: E402

from src.data import CLASSES, build_dataloaders  # noqa: E402
from src.metrics import confusion_matrix, macro_f1, per_class_f1  # noqa: E402
from src.models import build_model, count_parameters  # noqa: E402


def load_run(run_dir):
    """Rebuild a saved model from its config.yaml and load its best.pt weights.

    Returns (model, the run's config). Pretrained weights are not downloaded again:
    best.pt replaces every weight anyway.
    """
    run_dir = Path(run_dir)
    cfg = yaml.safe_load((run_dir / "config.yaml").read_text(encoding="utf-8"))
    model_args = dict(cfg.get("model_args") or {})
    if "pretrained" in model_args:
        model_args["pretrained"] = False
    model = build_model(cfg["model"], model_args)
    model.load_state_dict(torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True))
    return model.eval(), cfg


@torch.no_grad()
def predict(model, loader, device):
    """Return (predicted labels, true labels) for every image in the loader. float32, no AMP."""
    model.to(device).eval()
    all_preds, all_labels = [], []
    for images, labels in loader:
        all_preds.append(model(images.to(device)).argmax(dim=1).cpu())
        all_labels.append(labels)
    return torch.cat(all_preds), torch.cat(all_labels)


@torch.inference_mode()
def cpu_ms_per_image(model, image_size, threads, warmup_runs, timed_runs):
    """Median CPU time (milliseconds) for one image, batch size 1, after warm-up runs.

    Times the model only: the input is a random tensor of the right size.
    The thread count is put back afterwards, so later predictions use all threads again.
    """
    old_threads = torch.get_num_threads()
    torch.set_num_threads(threads)
    model = model.cpu().eval()
    x = torch.randn(1, 3, image_size, image_size)
    for _ in range(warmup_runs):
        model(x)
    times = []
    for _ in range(timed_runs):
        start = time.perf_counter()
        model(x)
        times.append((time.perf_counter() - start) * 1000)
    torch.set_num_threads(old_threads)
    return statistics.median(times)


def save_confusion_png(matrix, title, path):
    """Draw the confusion matrix (rows = true class, columns = predicted), with counts."""
    fig, ax = plt.subplots(figsize=(8, 7))
    ax.imshow(matrix, cmap="Blues")
    ax.set_xticks(range(len(CLASSES)), CLASSES, rotation=45, ha="right")
    ax.set_yticks(range(len(CLASSES)), CLASSES)
    ax.set_xlabel("predicted class")
    ax.set_ylabel("true class")
    ax.set_title(title)
    biggest = matrix.max().item()
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            count = matrix[i, j].item()
            color = "white" if count > biggest / 2 else "black"
            ax.text(j, i, count, ha="center", va="center", color=color, fontsize=8)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=120)
    plt.close(fig)


def evaluate_seed(run_dir, eval_cfg, device):
    """All test-split numbers for one saved run (one model, one seed)."""
    model, cfg = load_run(run_dir)
    image_size = cfg.get("image_size", 64)
    data_cfg = cfg["data"]
    _, _, test_loader = build_dataloaders(
        data_cfg, image_size, cfg.get("norm_stats"), cfg.get("target_stats")
    )
    preds, labels = predict(model, test_loader, device)
    n = len(CLASSES)
    matrix = confusion_matrix(preds, labels, n)
    result = {
        "accuracy": (preds == labels).sum().item() / len(labels),
        "macro_f1": macro_f1(preds, labels, n),
        "per_class_f1": dict(zip(CLASSES, per_class_f1(preds, labels, n))),
        "confusion_matrix": matrix.tolist(),
        "n_test_images": len(labels),
        "params": count_parameters(model),
        "image_size": image_size,
        "cpu_ms_per_image": cpu_ms_per_image(
            model,
            image_size,
            eval_cfg["cpu_threads"],
            eval_cfg["warmup_runs"],
            eval_cfg["timed_runs"],
        ),
    }
    return result, matrix


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    eval_cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    torch.manual_seed(eval_cfg["seed"])  # only sets the random input used for CPU timing
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device for predictions: {device}; CPU timing uses {eval_cfg['cpu_threads']} thread(s)")

    for entry in eval_cfg["models"]:
        seeds = {}
        for seed in entry["seeds"]:
            run_dir = Path(entry["run_dir"]) / f"seed{seed}"
            result, matrix = evaluate_seed(run_dir, eval_cfg, device)
            seeds[str(seed)] = result
            print(
                f"{entry['name']} seed {seed}: test acc {result['accuracy']:.4f} "
                f"macro-F1 {result['macro_f1']:.4f} | CPU {result['cpu_ms_per_image']:.2f} ms/image"
            )
            if seed == eval_cfg["confusion_seed"]:
                png = Path(eval_cfg["figures_dir"]) / f"confusion_{entry['name']}.png"
                save_confusion_png(matrix, f"{entry['name']} (seed {seed}, test split)", png)
        out = {
            "model": entry["name"],
            "run_dir": entry["run_dir"],
            "split": "test",
            "cpu_threads": eval_cfg["cpu_threads"],
            "warmup_runs": eval_cfg["warmup_runs"],
            "timed_runs": eval_cfg["timed_runs"],
            "seeds": seeds,
        }
        out_path = Path(eval_cfg["results_dir"]) / f"{entry['name']}.json"
        out_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
