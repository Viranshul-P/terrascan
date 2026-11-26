"""Step 8.4 part 2: train on tier-2 WorldCover labels; compare three stages by Indian LOAO accuracy.

Decision rule and recipe: configs/noisy_train.yaml (fixed before any run).
    python -m src.noisy_train --config configs/noisy_train.yaml --fast-dev-run
    python -m src.noisy_train --config configs/noisy_train.yaml
Writes results/noisy_labels.json and results/noisy_labels.md (with part 1's data counts).
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml
from torch.utils.data import ConcatDataset, DataLoader, Dataset, Subset

from src.data import CLASSES, EuroSATDataset, build_transforms
from src.error_audit import loao_folds, predict_with_probs
from src.evaluate import load_run
from src.india_eval import load_labels, split_by_area
from src.india_finetune import IndiaPatches, finetune, mean_std
from src.train import save_run, seed_everything


def partial_label_loss(logits, allowed):
    """-log(sum of softmax over the allowed classes), averaged. allowed: bool (N, classes)."""
    log_p = torch.log_softmax(logits.float(), dim=1)
    return -torch.logsumexp(log_p.masked_fill(~allowed, float("-inf")), dim=1).mean()


class Tier2(Dataset):
    """Tier-2 squares: (image tensor, allowed-class mask)."""

    def __init__(self, images, allowed, transform):
        self.images, self.allowed, self.transform = images, allowed, transform

    def __len__(self):
        return len(self.images)

    def __getitem__(self, i):
        img = torch.from_numpy(self.images[i]).permute(2, 0, 1).float() / 255
        return self.transform(img), torch.from_numpy(self.allowed[i])


class OneHot(Dataset):
    """A labelled dataset as (image, one-class mask), so it mixes with Tier2."""

    def __init__(self, ds):
        self.ds = ds

    def __len__(self):
        return len(self.ds)

    def __getitem__(self, i):
        img, label = self.ds[i]
        mask = torch.zeros(len(CLASSES), dtype=torch.bool)
        mask[label] = True
        return img, mask


def train_tier2(model, tier2, eurosat, rc, seed, device, max_batches=None):
    """Stage B: AdamW + cosine, tier-2 plus fresh EuroSAT each epoch; keeps the last epoch."""
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=rc["lr"], weight_decay=rc["weight_decay"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=rc["epochs"])
    scaler = torch.amp.GradScaler(device.type, enabled=device.type == "cuda")
    rng = np.random.default_rng(seed)
    history = []
    for epoch in range(1, rc["epochs"] + 1):
        picks = rng.choice(len(eurosat), size=rc["eurosat_images_per_epoch"], replace=False)
        loader = DataLoader(ConcatDataset([tier2, Subset(OneHot(eurosat), picks.tolist())]),
                            batch_size=rc["batch_size"], shuffle=True)
        model.train()
        total, seen = 0.0, 0
        for i, (x, allowed) in enumerate(loader):
            if max_batches is not None and i >= max_batches:
                break
            x, allowed = x.to(device), allowed.to(device)
            opt.zero_grad()
            with torch.autocast(device_type=device.type, dtype=torch.float16,
                                enabled=scaler.is_enabled()):
                loss = partial_label_loss(model(x), allowed)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            total += loss.item() * len(x)
            seen += len(x)
        sched.step()
        history.append({"epoch": epoch, "train/loss": total / seen})
        print(f"  tier-2 epoch {epoch}: loss {total / seen:.4f}")
    return history


def accuracy(preds, df):
    truth = [CLASSES.index(c) for c in df["final_label"]]
    return float((np.asarray(preds) == np.asarray(truth)).mean())


def better(a, b):
    """True if b beats a by more than their stds added together (the project's overlap rule)."""
    return b["mean"] - a["mean"] > a["std"] + b["std"]


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    p.add_argument("--fast-dev-run", action="store_true")
    args = p.parse_args(argv)
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    data_cfg = yaml.safe_load(Path(cfg["data_config"]).read_text(encoding="utf-8"))
    ft_cfg = yaml.safe_load(Path(cfg["india_finetune_config"]).read_text(encoding="utf-8"))
    eval_cfg = yaml.safe_load(Path(ft_cfg["india_eval_config"]).read_text(encoding="utf-8"))
    fast = args.fast_dev_run
    max_batches = 2 if fast else None
    seeds = cfg["seeds"][:1] if fast else cfg["seeds"]
    rc = {**cfg["tier2"], **({"epochs": 1} if fast else {})}
    ft = {**ft_cfg, **({"epochs": 1} if fast else {})}
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    suffix = "-fast-dev-run" if fast else ""

    labels = load_labels(eval_cfg["reviewed_csv"])
    finetune_df, _ = split_by_area(labels, eval_cfg["test_areas"], eval_cfg["finetune_areas"])
    assert not set(finetune_df["area"]) & set(eval_cfg["test_areas"])
    d = np.load(data_cfg["out_npz"])
    assert set(d["tier"]) == {"tier2"}
    patches_dir = eval_cfg["patches_dir"]

    audit = pd.read_csv(cfg["audit_predictions"])
    stage_a = {s: float((g["true"] == g["pred"]).mean())
               for s, g in audit[audit["model"] == "loao"].groupby("seed")}
    stage_b, stage_c = {}, {}
    for seed in seeds:
        seed_everything(seed)
        model, run_cfg = load_run(Path(cfg["base_run_dir"]) / f"seed{seed}")
        stats = run_cfg.get("norm_stats") or json.loads(
            Path(run_cfg["data"]["stats_path"]).read_text(encoding="utf-8"))
        transform = build_transforms(stats, True, run_cfg.get("image_size", 64),
                                     run_cfg.get("target_stats"))
        eurosat = EuroSATDataset(Path(run_cfg["data"]["splits_dir"]) / "train.csv",
                                 run_cfg["data"]["raw_dir"], transform)
        tier2 = Tier2(d["images"], d["allowed"], transform)
        print(f"Seed {seed}: stage B, tier-2 only ({len(tier2)} squares)")
        hist = train_tier2(model, tier2, eurosat, rc, seed, device, max_batches)
        b_dir = Path("models") / f"{cfg['run_prefix']}_tier2{suffix}" / f"seed{seed}"
        save_run(b_dir, model.state_dict(), {**run_cfg, "tier2": rc}, {"seed": seed}, hist)
        preds, _ = predict_with_probs(model, run_cfg, finetune_df, patches_dir, device)
        stage_b[seed] = accuracy(preds, finetune_df)
        print(f"  stage B accuracy on the 149 fine-tune patches: {stage_b[seed]:.3f}")
        all_preds, all_rows = [], []
        for area, train_df, held_out in loao_folds(finetune_df):
            seed_everything(seed)
            m, mcfg = load_run(b_dir)
            india = IndiaPatches(train_df, patches_dir, transform)
            finetune(m, india, eurosat, {**ft, "seed": seed}, device, max_batches)
            preds, _ = predict_with_probs(m, mcfg, held_out, patches_dir, device)
            all_preds += preds.tolist()
            all_rows.append(held_out)
            print(f"  stage C, held out {area}: {accuracy(preds, held_out):.3f}")
        stage_c[seed] = accuracy(all_preds, pd.concat(all_rows, ignore_index=True))
        print(f"  stage C pooled LOAO accuracy: {stage_c[seed]:.3f}")

    if fast:
        print("fast dev run: nothing written to results/")
        return
    stages = {"A_hand_only": mean_std([stage_a[s] for s in seeds]),
              "B_tier2_only": mean_std([stage_b[s] for s in seeds]),
              "C_tier2_then_hand": mean_std([stage_c[s] for s in seeds])}
    keep = next((k for k in ["C_tier2_then_hand", "B_tier2_only"]
                 if better(stages["A_hand_only"], stages[k])), "A_hand_only")
    data = json.loads(Path(data_cfg["output_json"]).read_text(encoding="utf-8"))
    out = {"config": "configs/noisy_train.yaml", "seeds": seeds,
           "per_seed": {"A_hand_only": stage_a, "B_tier2_only": stage_b,
                        "C_tier2_then_hand": stage_c},
           "stages": stages, "decision": keep, "data": data}
    Path(cfg["output_json"]).write_text(json.dumps(out, indent=1), encoding="utf-8")
    Path(cfg["output_md"]).write_text(report(out), encoding="utf-8")
    print(json.dumps({"stages": stages, "decision": keep}, indent=1))


def report(out):
    d, s = out["data"], out["stages"]
    a = d["agreement_with_hand_labels"]
    cities = ", ".join(f"{k} {v}" for k, v in d["per_city"].items())

    def row(k, name):
        return f"| {name} | {s[k]['mean']:.4f} ± {s[k]['std']:.4f} |"
    lines = [
        "# Noisy labels at scale (step 8.4)", "",
        "**Tier-2 set** (ESA WorldCover 2021, \"noisy reference\", never ground truth): "
        f"{d['n_squares']} squares from the 2026 showcase composites ({cities}). "
        f"{d['dropped_near_labelled_areas']} squares were dropped for lying within the buffer of a "
        f"hand-labelled area, {d['dropped_mixed_or_unmapped']} as mixed or with no matching class. "
        f"WorldCover classes kept (code: squares): {d['worldcover_class_kept']}. Mapping: the 8.2 "
        f"table, as sets ({d['allowed_sets']}). Licence: {d['licence']}. "
        f"Note: {d['time_gap_note']}.", "",
        "**Agreement with the hand labels** (an agreement rate, not the product's accuracy): "
        f"WorldCover gives a set for {a['compared']} of {a['hand_labelled_squares']} hand-labelled "
        f"squares; the hand label is in it for {a['agree']} ({a['agreement_rate']:.2%}). "
        "Coarse sets (built-up = Residential or Industrial) make agreement easy.", "",
        "**Three stages** (Indian leave-one-area-out accuracy, 149 fine-tune patches pooled, "
        f"seeds {out['seeds']}, mean ± sample std):", "",
        "| Stage | LOAO accuracy |", "|---|---|",
        row("A_hand_only", "A: hand labels only (8.1 audit)"),
        row("B_tier2_only", "B: tier 2 only (no hand labels)"),
        row("C_tier2_then_hand", "C: tier 2, then hand labels"), "",
        f"**Decision:** `{out['decision']}` (rule in configs/noisy_train.yaml: better only if "
        "the mean beats A by more than the two stds added together).", "",
        "Made by `src/noisy_labels.py` and `src/noisy_train.py`; "
        "numbers in `results/noisy_labels.json`.",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
