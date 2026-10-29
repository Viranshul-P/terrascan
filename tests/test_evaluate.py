"""Checks on src/evaluate.py with tiny models and fake data (no network, no real images)."""

import torch
import yaml
from torch.utils.data import DataLoader, TensorDataset

from src.evaluate import cpu_ms_per_image, load_run, predict, save_confusion_png
from src.models import build_model


def save_fake_run(run_dir, cfg):
    """Write a run folder like train.py does: config.yaml + best.pt."""
    run_dir.mkdir(parents=True)
    model_args = dict(cfg.get("model_args") or {})
    if "pretrained" in model_args:
        model_args["pretrained"] = False  # random weights, no download
    model = build_model(cfg["model"], model_args)
    torch.save(model.state_dict(), run_dir / "best.pt")
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg), encoding="utf-8")
    return model


def test_load_run_gives_back_the_saved_weights(tmp_path):
    saved = save_fake_run(tmp_path / "seed42", {"model": "tiny"})
    loaded, cfg = load_run(tmp_path / "seed42")
    assert cfg["model"] == "tiny"
    assert torch.equal(loaded.linear.weight, saved.linear.weight)


def test_load_run_does_not_download_pretrained_weights(tmp_path):
    # the config says pretrained: true, but best.pt replaces every weight, so no download is needed
    cfg = {"model": "resnet18", "model_args": {"pretrained": True}}
    saved = save_fake_run(tmp_path / "seed42", cfg)
    loaded, _ = load_run(tmp_path / "seed42")
    assert torch.equal(loaded.conv1.weight, saved.conv1.weight)


def test_predict_returns_one_label_per_image():
    model = build_model("tiny")
    images = torch.randn(10, 3, 64, 64)
    labels = torch.randint(0, 10, (10,))
    loader = DataLoader(TensorDataset(images, labels), batch_size=4)
    preds, true = predict(model, loader, torch.device("cpu"))
    assert preds.shape == (10,) and torch.equal(true, labels)
    assert torch.equal(preds, model(images).argmax(dim=1))


def test_cpu_timing_is_positive():
    threads_before = torch.get_num_threads()
    ms = cpu_ms_per_image(build_model("tiny"), 64, threads=1, warmup_runs=2, timed_runs=5)
    assert ms > 0
    assert torch.get_num_threads() == threads_before  # thread count is put back


def test_confusion_png_is_saved(tmp_path):
    path = tmp_path / "confusion.png"
    save_confusion_png(torch.eye(10, dtype=torch.long) * 5, "test", path)
    assert path.exists() and path.stat().st_size > 0
