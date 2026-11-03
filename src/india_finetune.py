"""Fine-tune the EuroSAT model on Indian patches, then re-measure (step 4.4).

Run from the repo root:
    python -m src.india_finetune --config configs/india_finetune.yaml --fast-dev-run
    python -m src.india_finetune --config configs/india_finetune.yaml

For each seed: start from models/<base>/seed<N>/, train on the Indian FINE-TUNE areas mixed with
some EuroSAT train images (so Europe is not forgotten), with a fixed
recipe (no tuning, keep the last epoch), and save to models/<run_name>/seed<N>/.
Then a "did it forget Europe?" check on EuroSAT VAL. Only if every seed passes are the test sets
scored: Indian test areas and EuroSAT test, before and after.
Results go to results/india_after.json.
"""

import argparse
import json
import statistics
import time
from pathlib import Path

import numpy as np
import torch
import yaml
from torch.utils.data import ConcatDataset, DataLoader, Dataset, Subset

from src.data import CLASSES, EuroSATDataset, build_dataloaders, build_transforms, read_image
from src.evaluate import load_run, predict
from src.india_eval import load_labels, predict_patches, score, split_by_area
from src.metrics import macro_f1
from src.train import save_run, seed_everything, train_one_epoch


class IndiaPatches(Dataset):
    """Indian patches with the user's final labels: returns (image tensor, label number)."""

    def __init__(self, df, patches_dir, transform):
        self.files = list(df["file"])
        self.labels = [CLASSES.index(name) for name in df["final_label"]]
        self.patches_dir = Path(patches_dir)
        self.transform = transform

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        image = read_image(self.patches_dir / self.files[i])
        return self.transform(image), self.labels[i]


def mixed_loader(india, eurosat, n_eurosat, batch_size, rng):
    """One epoch's data: every Indian patch plus n_eurosat EuroSAT TRAIN images drawn at random
    (a fresh draw each epoch, without repeats), all shuffled together."""
    picks = rng.choice(len(eurosat), size=n_eurosat, replace=False).tolist()
    mixed = ConcatDataset([india, Subset(eurosat, picks)])
    return DataLoader(mixed, batch_size=batch_size, shuffle=True)


def finetune(model, india, eurosat, ft_cfg, device, max_batches=None):
    """Train all layers with AdamW + cosine LR for ft_cfg["epochs"] epochs; keep the LAST epoch.

    Each epoch mixes the Indian patches with ft_cfg["eurosat_images_per_epoch"] EuroSAT train
    images, so the model keeps seeing Europe and does not forget it (first try without mixing:
    models/efficientnet_b0_india_nomix/).
    There is no Indian val set, so there is nothing to pick a "best" epoch with.
    Returns the history: one dict per epoch (train loss and accuracy on that epoch's mixed data).
    """
    model.to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=ft_cfg["lr"], weight_decay=ft_cfg["weight_decay"]
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=ft_cfg["epochs"])
    scaler = torch.amp.GradScaler(device.type, enabled=device.type == "cuda")
    rng = np.random.default_rng(ft_cfg["seed"])
    history = []
    for epoch in range(1, ft_cfg["epochs"] + 1):
        lr = optimizer.param_groups[0]["lr"]
        loader = mixed_loader(
            india, eurosat, ft_cfg["eurosat_images_per_epoch"], ft_cfg["batch_size"], rng
        )
        loss, acc = train_one_epoch(
            model, loader, optimizer, scaler, device, max_batches, ft_cfg["label_smoothing"]
        )
        scheduler.step()
        history.append({"epoch": epoch, "train/loss": loss, "train/acc": acc, "lr": lr})
        print(f"  epoch {epoch}: loss {loss:.4f} acc {acc:.4f} | lr {lr:.2e}")
    return history


def eurosat_scores(model, loader, device, max_batches=None):
    """Accuracy and macro-F1 on a EuroSAT loader (float32, as in step 2.5)."""
    preds, labels = predict(model, loader, device, max_batches)
    return {
        "accuracy": (preds == labels).sum().item() / len(labels),
        "macro_f1": macro_f1(preds, labels, len(CLASSES)),
        "n_images": len(labels),
    }


def mean_std(values):
    """Mean and sample std (as for every 3-seed result in this project)."""
    std = statistics.stdev(values) if len(values) > 1 else 0.0
    return {"mean": statistics.mean(values), "std": std}


def forgetting_check(val_before, val_after, max_drop):
    """Seeds whose EuroSAT VAL accuracy fell by more than max_drop (empty list = passed)."""
    return [s for s in val_before if val_before[s] - val_after[s] > max_drop]


def finetune_seeds(ft_cfg, eval_cfg, seeds, run_name, finetune_df, device, max_batches, fast):
    """Part 1: fine-tune each seed, save it, and measure EuroSAT VAL accuracy before/after.

    No test set is touched here. Returns (val_before, val_after): {seed: accuracy}.
    """
    val_before, val_after = {}, {}
    for seed in seeds:
        print(f"Seed {seed}: fine-tuning {ft_cfg['base_run_dir']}/seed{seed}")
        seed_everything(seed)
        model, cfg = load_run(Path(ft_cfg["base_run_dir"]) / f"seed{seed}")
        stats = cfg.get("norm_stats") or json.loads(
            Path(cfg["data"]["stats_path"]).read_text(encoding="utf-8")
        )
        # Same training augmentations and scaling for the Indian and the EuroSAT images
        transform = build_transforms(
            stats, True, cfg.get("image_size", 64), cfg.get("target_stats")
        )
        india = IndiaPatches(finetune_df, eval_cfg["patches_dir"], transform)
        eurosat_train = EuroSATDataset(
            Path(cfg["data"]["splits_dir"]) / "train.csv", cfg["data"]["raw_dir"], transform
        )
        _, eurosat_val, _ = build_dataloaders(
            cfg["data"], cfg.get("image_size", 64), cfg.get("norm_stats"), cfg.get("target_stats")
        )
        val_before[seed] = eurosat_scores(model, eurosat_val, device, max_batches)["accuracy"]
        start = time.time()
        history = finetune(
            model, india, eurosat_train, {**ft_cfg, "seed": seed}, device, max_batches
        )
        seconds = time.time() - start
        val_after[seed] = eurosat_scores(model, eurosat_val, device, max_batches)["accuracy"]
        print(f"  EuroSAT val acc {val_before[seed]:.4f} -> {val_after[seed]:.4f}")

        metrics = {
            "seed": seed,
            "epochs_run": ft_cfg["epochs"],
            "kept_epoch": "last",
            "train_seconds": seconds,
            "eurosat_val_acc_before": val_before[seed],
            "eurosat_val_acc_after": val_after[seed],
            "n_finetune_patches": len(finetune_df),
            "eurosat_images_per_epoch": ft_cfg["eurosat_images_per_epoch"],
        }
        run_cfg = {**cfg, "run_name": run_name, "finetune": ft_cfg, "fast_dev_run": fast}
        out_dir = Path("models") / run_name / f"seed{seed}"
        save_run(out_dir, model.state_dict(), run_cfg, metrics, history)
        print(f"  Saved to {out_dir}")
    return val_before, val_after


def score_test_sets(ft_cfg, eval_cfg, seeds, run_name, finetune_df, test_df, val_scores, device):
    """Part 2: score the Indian test areas and the EuroSAT test set, before (EuroSAT model)
    and after (fine-tuned model), for every seed. Writes results/india_after.json."""
    val_before, val_after = val_scores
    # All seeds and both models share the same data settings (the fine-tuned runs copy the base
    # run's config), so one EuroSAT test loader is enough. Built once: each build starts worker
    # processes, and this laptop has run low on RAM before.
    _, base_cfg = load_run(Path(ft_cfg["base_run_dir"]) / f"seed{seeds[0]}")
    _, _, eurosat_test = build_dataloaders(
        base_cfg["data"],
        base_cfg.get("image_size", 64),
        base_cfg.get("norm_stats"),
        base_cfg.get("target_stats"),
    )
    per_seed = {}
    for seed in seeds:
        result = {
            "eurosat_val_acc_before": val_before[seed],
            "eurosat_val_acc_after": val_after[seed],
        }
        for when, run_dir in [
            ("before", Path(ft_cfg["base_run_dir"])),
            ("after", Path("models") / run_name),
        ]:
            model, cfg = load_run(run_dir / f"seed{seed}")
            preds, labels = predict_patches(model, cfg, test_df, eval_cfg["patches_dir"], device)
            result[f"india_test_{when}"] = score(preds, labels, eval_cfg)
            result[f"eurosat_test_{when}"] = eurosat_scores(model, eurosat_test, device)
        per_seed[str(seed)] = result
        print(
            f"Seed {seed}: India test acc {result['india_test_before']['accuracy']:.3f} -> "
            f"{result['india_test_after']['accuracy']:.3f} | EuroSAT test acc "
            f"{result['eurosat_test_before']['accuracy']:.4f} -> "
            f"{result['eurosat_test_after']['accuracy']:.4f}"
        )

    summary = {}
    for key, metric in [
        ("india_test", "accuracy"),
        ("india_test", "macro_f1"),
        ("eurosat_test", "accuracy"),
        ("eurosat_test", "macro_f1"),
    ]:
        for when in ["before", "after"]:
            values = [per_seed[str(s)][f"{key}_{when}"][metric] for s in seeds]
            summary[f"{key}_{metric}_{when}"] = mean_std(values)
    for when in ["before", "after"]:
        summary[f"eurosat_val_accuracy_{when}"] = mean_std(
            [per_seed[str(s)][f"eurosat_val_acc_{when}"] for s in seeds]
        )

    recipe_keys = [
        "epochs",
        "lr",
        "weight_decay",
        "label_smoothing",
        "batch_size",
        "eurosat_images_per_epoch",
    ]
    out = {
        "base_run_dir": ft_cfg["base_run_dir"],
        "finetuned_run_dir": f"models/{run_name}",
        "seeds": seeds,
        "finetune_areas": eval_cfg["finetune_areas"],
        "test_areas": eval_cfg["test_areas"],
        "n_finetune_patches": len(finetune_df),
        "n_india_test_patches": len(test_df),
        "recipe": {k: ft_cfg[k] for k in recipe_keys} | {"kept_epoch": "last"},
        "max_eurosat_val_drop": ft_cfg["max_eurosat_val_drop"],
        "summary_mean_std_over_seeds": summary,
        "per_seed": per_seed,
    }
    Path(ft_cfg["output_path"]).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {ft_cfg['output_path']}")


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--fast-dev-run", action="store_true", help="2 batches, 1 epoch, 1 seed")
    args = parser.parse_args(argv)
    ft_cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    eval_cfg = yaml.safe_load(Path(ft_cfg["india_eval_config"]).read_text(encoding="utf-8"))

    seeds, run_name, max_batches = ft_cfg["seeds"], ft_cfg["run_name"], None
    if args.fast_dev_run:
        ft_cfg["epochs"], seeds, max_batches = 1, seeds[:1], 2
        run_name += "-fast-dev-run"
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    df = load_labels(eval_cfg["reviewed_csv"])
    finetune_df, test_df = split_by_area(df, eval_cfg["test_areas"], eval_cfg["finetune_areas"])
    print(f"{len(finetune_df)} fine-tune patches, {len(test_df)} test patches")

    val_before, val_after = finetune_seeds(
        ft_cfg, eval_cfg, seeds, run_name, finetune_df, device, max_batches, args.fast_dev_run
    )

    # The gate: no test set is scored unless every seed passed the EuroSAT VAL check.
    failed = forgetting_check(val_before, val_after, ft_cfg["max_eurosat_val_drop"])
    if args.fast_dev_run:
        print("Fast dev run: stopping before the test sets.")
        return
    if failed:
        print(
            f"STOP: EuroSAT val accuracy fell more than {ft_cfg['max_eurosat_val_drop']} for "
            f"seeds {failed}. Change the recipe (lower LR or mix in EuroSAT). No test set scored."
        )
        return
    print("Forgetting check passed on EuroSAT val. Scoring the test sets once.")
    score_test_sets(
        ft_cfg, eval_cfg, seeds, run_name, finetune_df, test_df, (val_before, val_after), device
    )


if __name__ == "__main__":
    main()
