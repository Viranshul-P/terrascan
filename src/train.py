"""Train a model from a YAML config and save it to models/<run_name>/seed<N>/.

Run from the repo root:
    python -m src.train --config configs/train_tiny.yaml --seed 42
    python -m src.train --config configs/train_tiny.yaml --fast-dev-run   # 2 batches, 1 epoch
"""

import argparse
import copy
import json
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import wandb
import yaml
from torch import nn

from src.data import build_dataloaders
from src.metrics import macro_f1
from src.models import build_model, count_parameters


def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)  # also seeds CUDA


def train_one_epoch(
    model, loader, optimizer, scaler, device, max_batches=None, label_smoothing=0.0
):
    """One pass over the training data. Returns (mean loss, accuracy).

    label_smoothing > 0: the target is e.g. 0.91 for the true class and 0.01 for each other
    class instead of 1 and 0, so the model is not pushed to be 100% sure.
    """
    model.train()
    loss_fn = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    total_loss, correct, seen = 0.0, 0, 0
    use_amp = scaler.is_enabled()
    for i, (images, labels) in enumerate(loader):
        if max_batches is not None and i >= max_batches:
            break
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        # AMP: run the forward pass in float16 where it is safe (only on CUDA)
        with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=use_amp):
            outputs = model(images)
            loss = loss_fn(outputs, labels)
        # The scaler multiplies the loss so small float16 gradients don't round to zero
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        total_loss += loss.item() * len(labels)
        correct += (outputs.argmax(dim=1) == labels).sum().item()
        seen += len(labels)
    return total_loss / seen, correct / seen


@torch.no_grad()
def evaluate(model, loader, device, max_batches=None):
    """Returns (mean loss, accuracy, macro-F1) on a loader, without changing the model."""
    model.eval()
    loss_fn = nn.CrossEntropyLoss()
    total_loss, seen = 0.0, 0
    all_preds, all_labels = [], []
    use_amp = device.type == "cuda"
    for i, (images, labels) in enumerate(loader):
        if max_batches is not None and i >= max_batches:
            break
        images, labels = images.to(device), labels.to(device)
        with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=use_amp):
            outputs = model(images)
            loss = loss_fn(outputs, labels)
        total_loss += loss.item() * len(labels)
        seen += len(labels)
        all_preds.append(outputs.argmax(dim=1).cpu())
        all_labels.append(labels.cpu())
    preds, labels = torch.cat(all_preds), torch.cat(all_labels)
    accuracy = (preds == labels).sum().item() / seen
    return total_loss / seen, accuracy, macro_f1(preds, labels, num_classes=outputs.shape[1])


def fit(model, train_loader, val_loader, cfg, device, run, max_batches=None):
    """Train with AdamW + cosine LR, stop early on val loss.

    Optional cfg keys (default = off, as in v1): label_smoothing, warmup_epochs.
    Val loss is always plain cross-entropy, so runs with and without smoothing compare fairly.
    Returns (best weights, metrics dict, history: one dict per epoch).
    """
    model.to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg["lr"], weight_decay=cfg["weight_decay"]
    )
    label_smoothing = cfg.get("label_smoothing", 0.0)
    warmup = cfg.get("warmup_epochs", 0)
    cosine = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg["epochs"] - warmup)
    if warmup > 0:
        # Warmup: start at 10% of the LR and grow linearly to the full LR, then cosine decay
        ramp = torch.optim.lr_scheduler.LinearLR(optimizer, start_factor=0.1, total_iters=warmup)
        scheduler = torch.optim.lr_scheduler.SequentialLR(
            optimizer, schedulers=[ramp, cosine], milestones=[warmup]
        )
    else:
        scheduler = cosine
    scaler = torch.amp.GradScaler(device.type, enabled=device.type == "cuda")
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats()

    best_val_loss = float("inf")
    best_state, best_epoch, best_val_acc, best_val_f1 = None, 0, 0.0, 0.0
    epochs_without_improvement = 0
    history = []
    start = time.time()
    for epoch in range(1, cfg["epochs"] + 1):
        lr = optimizer.param_groups[0]["lr"]
        train_loss, train_acc = train_one_epoch(
            model, train_loader, optimizer, scaler, device, max_batches, label_smoothing
        )
        val_loss, val_acc, val_f1 = evaluate(model, val_loader, device, max_batches)
        scheduler.step()
        peak_mem_mb = torch.cuda.max_memory_allocated() / 2**20 if device.type == "cuda" else 0.0
        row = {
            "epoch": epoch,
            "train/loss": train_loss,
            "train/acc": train_acc,
            "val/loss": val_loss,
            "val/acc": val_acc,
            "val/f1": val_f1,
            "lr": lr,
            "peak_gpu_mem_mb": peak_mem_mb,
        }
        history.append(row)
        run.log(row)
        print(
            f"epoch {epoch}: train loss {train_loss:.4f} acc {train_acc:.4f} | "
            f"val loss {val_loss:.4f} acc {val_acc:.4f} f1 {val_f1:.4f} | lr {lr:.2e}"
        )

        if val_loss < best_val_loss:
            best_val_loss, best_val_acc, best_epoch = val_loss, val_acc, epoch
            best_val_f1 = val_f1
            best_state = copy.deepcopy(model.state_dict())
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= cfg["patience"]:
                print(f"Early stopping: no better val loss for {cfg['patience']} epochs")
                break

    metrics = {
        "best_epoch": best_epoch,
        "best_val_loss": best_val_loss,
        "best_val_acc": best_val_acc,
        "best_val_f1": best_val_f1,
        "epochs_run": epoch,
        "peak_gpu_mem_mb": peak_mem_mb,
        "train_seconds": time.time() - start,
    }
    return best_state, metrics, history


def save_run(out_dir, best_state, cfg, metrics, history):
    """Save best weights, the exact config, metrics.json and history.csv to out_dir."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    torch.save(best_state, out_dir / "best.pt")
    (out_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    pd.DataFrame(history).to_csv(out_dir / "history.csv", index=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--fast-dev-run", action="store_true", help="2 batches, 1 epoch")
    args = parser.parse_args()

    cfg = yaml.safe_load(open(args.config, encoding="utf-8"))
    data_cfg = yaml.safe_load(open(cfg["data_config"], encoding="utf-8"))
    cfg["seed"] = args.seed
    cfg["fast_dev_run"] = args.fast_dev_run
    max_batches = None
    run_name = cfg["run_name"]
    if args.fast_dev_run:
        cfg["epochs"] = 1
        max_batches = 2
        run_name += "-fast-dev-run"

    seed_everything(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    run = wandb.init(
        project=cfg["wandb"]["project"],
        name=f"{run_name}-seed{args.seed}",
        config={**cfg, "data": data_cfg},
        tags=["fast-dev-run"] if args.fast_dev_run else None,
        mode="online" if cfg["wandb"]["enabled"] else "disabled",
    )
    train_loader, val_loader, _ = build_dataloaders(data_cfg)  # test split is not used here
    model = build_model(cfg["model"], cfg.get("model_args"))
    best_state, metrics, history = fit(
        model, train_loader, val_loader, cfg, device, run, max_batches
    )
    metrics["seed"] = args.seed
    metrics["params"] = count_parameters(model)

    out_dir = Path("models") / run_name / f"seed{args.seed}"
    save_run(out_dir, best_state, {**cfg, "data": data_cfg}, metrics, history)
    run.summary.update(metrics)
    run.finish()
    print(f"Saved to {out_dir}")


if __name__ == "__main__":
    main()
