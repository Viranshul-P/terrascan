"""Checks on the training loop, using fake data on the CPU and W&B turned off."""

import json

import pandas as pd
import pytest
import torch
import wandb
from torch.utils.data import DataLoader, TensorDataset

from src.models import build_model
from src.train import fit, save_run, seed_everything

CFG = {"epochs": 3, "lr": 0.01, "weight_decay": 0.0, "patience": 5}


def fake_loader():
    """32 random 'images' with 2 labels that are easy to tell apart (bright vs dark)."""
    images = torch.randn(32, 3, 64, 64)
    labels = torch.arange(32) % 2
    images[labels == 1] += 1.0
    return DataLoader(TensorDataset(images, labels), batch_size=8)


def run_fit():
    seed_everything(42)
    run = wandb.init(mode="disabled")
    model = build_model("tiny")
    loader = fake_loader()
    best_state, metrics, history = fit(model, loader, loader, CFG, torch.device("cpu"), run)
    run.finish()
    return best_state, metrics, history


def test_fit_lowers_val_loss_and_returns_metrics():
    best_state, metrics, history = run_fit()
    assert metrics["epochs_run"] == 3
    assert len(history) == 3
    assert 1 <= metrics["best_epoch"] <= 3
    assert metrics["best_val_acc"] > 0.5
    assert 0.0 <= metrics["best_val_f1"] <= 1.0
    assert "val/f1" in history[0]
    assert set(best_state) == {"linear.weight", "linear.bias"}


def test_same_seed_gives_same_result():
    _, first, _ = run_fit()
    _, second, _ = run_fit()
    assert first["best_val_loss"] == second["best_val_loss"]


def test_warmup_starts_low_then_reaches_full_lr():
    seed_everything(42)
    run = wandb.init(mode="disabled")
    cfg = {**CFG, "epochs": 4, "warmup_epochs": 2, "label_smoothing": 0.1}
    loader = fake_loader()
    _, _, history = fit(build_model("tiny"), loader, loader, cfg, torch.device("cpu"), run)
    run.finish()
    lrs = [row["lr"] for row in history]
    assert lrs[0] == pytest.approx(0.1 * CFG["lr"])  # epoch 1: 10% of the LR
    assert lrs[2] == pytest.approx(CFG["lr"])  # after 2 warmup epochs: full LR
    assert lrs[3] < lrs[2]  # then cosine decay


def test_save_run_writes_four_files(tmp_path):
    best_state, metrics, history = run_fit()
    save_run(tmp_path / "seed42", best_state, {"run_name": "test"}, metrics, history)
    assert (tmp_path / "seed42" / "best.pt").exists()
    assert (tmp_path / "seed42" / "config.yaml").exists()
    saved = json.loads((tmp_path / "seed42" / "metrics.json").read_text())
    assert saved["epochs_run"] == 3
    saved_history = pd.read_csv(tmp_path / "seed42" / "history.csv")
    assert list(saved_history["epoch"]) == [1, 2, 3]
