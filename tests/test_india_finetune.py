import numpy as np
import pandas as pd
import pytest
import torch
from PIL import Image
from torch import nn
from torch.utils.data import TensorDataset

from src.data import build_transforms
from src.india_finetune import IndiaPatches, finetune, forgetting_check, mean_std, mixed_loader


def make_patches(tmp_path, labels):
    rng = np.random.default_rng(0)
    for i in range(len(labels)):
        pixels = rng.integers(0, 256, size=(64, 64, 3), dtype=np.uint8)
        Image.fromarray(pixels).save(tmp_path / f"p{i}.png")
    return pd.DataFrame({"file": [f"p{i}.png" for i in range(len(labels))], "final_label": labels})


def test_india_patches_returns_image_and_label(tmp_path):
    df = make_patches(tmp_path, ["Forest", "Residential"])
    stats = {"mean": [0.5] * 3, "std": [0.25] * 3}
    dataset = IndiaPatches(df, tmp_path, build_transforms(stats, True))
    image, label = dataset[1]
    assert image.shape == (3, 64, 64)
    assert label == 7  # Residential in the alphabetical class list
    assert len(dataset) == 2


def test_mixed_loader_has_all_india_plus_n_eurosat(tmp_path):
    india = TensorDataset(torch.zeros(5, 1), torch.zeros(5, dtype=torch.long))
    eurosat = TensorDataset(torch.ones(100, 1), torch.ones(100, dtype=torch.long))
    rng = np.random.default_rng(0)
    loader = mixed_loader(india, eurosat, 20, batch_size=8, rng=rng)
    labels = torch.cat([y for _, y in loader])
    assert len(labels) == 25
    assert (labels == 0).sum() == 5 and (labels == 1).sum() == 20


def test_finetune_changes_weights_and_logs_each_epoch(tmp_path):
    torch.manual_seed(0)
    df = make_patches(tmp_path, ["Forest", "Residential", "River", "Highway"])
    stats = {"mean": [0.5] * 3, "std": [0.25] * 3}
    india = IndiaPatches(df, tmp_path, build_transforms(stats, True))
    eurosat = IndiaPatches(df, tmp_path, build_transforms(stats, True))  # stand-in for EuroSAT
    model = nn.Sequential(nn.Flatten(), nn.Linear(3 * 64 * 64, 10))
    before = model[1].weight.clone()
    cfg = {
        "epochs": 2,
        "lr": 0.01,
        "weight_decay": 0.0,
        "label_smoothing": 0.1,
        "batch_size": 2,
        "eurosat_images_per_epoch": 2,
        "seed": 0,
    }
    history = finetune(model, india, eurosat, cfg, torch.device("cpu"))
    assert [row["epoch"] for row in history] == [1, 2]
    assert not torch.equal(before, model[1].weight)


def test_forgetting_check_flags_only_big_drops():
    before = {42: 0.99, 43: 0.99}
    after = {42: 0.98, 43: 0.95}  # 43 drops 4 points
    assert forgetting_check(before, after, 0.02) == [43]
    assert forgetting_check(before, before, 0.02) == []


def test_mean_std_uses_sample_std():
    result = mean_std([1.0, 2.0, 3.0])
    assert result["mean"] == 2.0
    assert result["std"] == pytest.approx(1.0)


def run_main_with_val_drop(tmp_path, monkeypatch, drop):
    """Run main() on fake config + labels, with fine-tuning stubbed out to give `drop`.
    Returns True if the test sets would have been scored."""
    import yaml

    from src import india_finetune

    reviewed = tmp_path / "reviewed.csv"
    pd.DataFrame(
        {"file": ["a.png", "b.png"], "final_label": ["Forest", "River"], "area": ["ft", "te"]}
    ).to_csv(reviewed, index=False)
    eval_cfg = {"reviewed_csv": str(reviewed), "test_areas": ["te"], "finetune_areas": ["ft"]}
    (tmp_path / "eval.yaml").write_text(yaml.safe_dump(eval_cfg), encoding="utf-8")
    ft_cfg = {
        "india_eval_config": str(tmp_path / "eval.yaml"),
        "seeds": [42, 43],
        "run_name": "fake",
        "max_eurosat_val_drop": 0.02,
    }
    (tmp_path / "ft.yaml").write_text(yaml.safe_dump(ft_cfg), encoding="utf-8")

    def fake_finetune_seeds(*args):
        return {42: 0.99, 43: 0.99}, {42: 0.99, 43: 0.99 - drop}

    scored = []
    monkeypatch.setattr(india_finetune, "finetune_seeds", fake_finetune_seeds)
    monkeypatch.setattr(india_finetune, "score_test_sets", lambda *args: scored.append(True))
    india_finetune.main(["--config", str(tmp_path / "ft.yaml")])
    return bool(scored)


def test_main_never_scores_test_sets_after_a_big_val_drop(tmp_path, monkeypatch):
    assert not run_main_with_val_drop(tmp_path, monkeypatch, drop=0.05)


def test_main_scores_test_sets_when_val_check_passes(tmp_path, monkeypatch):
    assert run_main_with_val_drop(tmp_path, monkeypatch, drop=0.01)
