"""Grad-CAM (step 3.2): where does the best model look when it decides?

Grad-CAM colours the parts of an image that pushed the model toward its predicted class.
Uses the TEST split only to look at examples. Nothing here changes a model or a setting.

Run from the repo root:
    python -m src.gradcam --config configs/gradcam.yaml
"""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save PNGs without opening a window
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
import yaml  # noqa: E402
from pytorch_grad_cam import GradCAM  # noqa: E402
from pytorch_grad_cam.utils.image import show_cam_on_image  # noqa: E402
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget  # noqa: E402

from src.confusion import pick_best_model  # noqa: E402
from src.data import CLASSES, build_dataloaders, read_image  # noqa: E402
from src.evaluate import load_run, predict  # noqa: E402


def pick_examples(preds, labels, n, seed):
    """Pick n correct and n wrong image indices at random (seeded, so not hand-picked)."""
    generator = torch.Generator().manual_seed(seed)
    correct = (preds == labels).nonzero().flatten()
    wrong = (preds != labels).nonzero().flatten()
    correct = correct[torch.randperm(len(correct), generator=generator)[:n]]
    wrong = wrong[torch.randperm(len(wrong), generator=generator)[:n]]
    return correct.tolist(), wrong.tolist()


def gradcam_maps(model, target_layer, images, classes):
    """Grad-CAM heatmap for each image, for the given class. Returns numpy (N, H, W), values 0-1."""
    targets = [ClassifierOutputTarget(c) for c in classes]
    with GradCAM(model=model, target_layers=[target_layer]) as cam:
        return cam(input_tensor=images, targets=targets)


def save_grid(rows, path, title):
    """rows: list of (row title, list of (display image HxWx3 0-1, heatmap, caption)).
    Each example takes two columns: the image, then the image with its heatmap on top."""
    n_cols = 2 * max(len(examples) for _, examples in rows)
    fig, axes = plt.subplots(
        len(rows), n_cols, figsize=(1.6 * n_cols, 2.0 * len(rows)), squeeze=False
    )
    for r, (row_title, examples) in enumerate(rows):
        for c in range(n_cols):
            axes[r][c].axis("off")
        for k, (image, heatmap, caption) in enumerate(examples):
            axes[r][2 * k].imshow(image)
            axes[r][2 * k].set_title(caption, fontsize=6)
            axes[r][2 * k + 1].imshow(show_cam_on_image(image, heatmap, use_rgb=True))
            axes[r][2 * k + 1].set_title("Grad-CAM", fontsize=6)
        axes[r][0].text(
            -0.15, 0.5, row_title, transform=axes[r][0].transAxes,
            ha="right", va="center", fontsize=8,
        )
    fig.suptitle(title, fontsize=10)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=130, bbox_inches="tight")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))

    best, val_mean = pick_best_model(cfg["candidates"], cfg["val_seeds"])
    print(f"Best model by mean val accuracy: {best['name']} ({val_mean:.4f})")

    run_dir = Path(best["run_dir"]) / f"seed{cfg['seed']}"
    model, run_cfg = load_run(run_dir)
    data_cfg = run_cfg["data"]
    image_size = run_cfg.get("image_size", 64)
    _, _, test_loader = build_dataloaders(
        data_cfg, image_size, run_cfg.get("norm_stats"), run_cfg.get("target_stats")
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    preds, labels = predict(model, test_loader, device)
    print(f"Test images: {len(labels)}, wrong: {int((preds != labels).sum())}")

    correct_idx, wrong_idx = pick_examples(preds, labels, cfg["n_examples"], cfg["seed"])
    chosen = correct_idx + wrong_idx

    # Same tensors the model saw (resized + normalised by the test transforms).
    images = torch.stack([test_loader.dataset[i][0] for i in chosen]).to(device)
    with torch.no_grad():
        probs = model(images).softmax(dim=1).cpu()
    pred_classes = [int(preds[i]) for i in chosen]
    target_layer = model.get_submodule(cfg["target_layer"])
    heatmaps = gradcam_maps(model, target_layer, images, pred_classes)

    test_df = pd.read_csv(Path(data_cfg["splits_dir"]) / "test.csv")  # loader isn't shuffled
    examples = []
    for k, i in enumerate(chosen):
        # Original JPEG, resized the same way as the model input so the heatmap lines up.
        image = read_image(Path(data_cfg["raw_dir"]) / test_df.iloc[i]["path"])
        image = F.interpolate(image[None], size=image_size, mode="bilinear", antialias=True)[0]
        caption = (
            f"true: {CLASSES[labels[i]]}\npred: {CLASSES[preds[i]]} "
            f"({probs[k, pred_classes[k]]:.2f})"
        )
        examples.append((image.permute(1, 2, 0).clamp(0, 1).numpy(), heatmaps[k], caption))

    half = cfg["examples_per_row"]
    n = cfg["n_examples"]
    rows = [
        ("Correct", examples[:half]),
        ("Correct", examples[half:n]),
        ("Wrong", examples[n:n + half]),
        ("Wrong", examples[n + half:]),
    ]
    title = (
        f"Grad-CAM, {best['name']} seed {cfg['seed']}, TEST split "
        f"(random picks, seed {cfg['seed']}; heatmap for the predicted class)"
    )
    save_grid(rows, Path(cfg["figure_path"]), title)
    print(f"Saved {cfg['figure_path']}")


if __name__ == "__main__":
    main()
