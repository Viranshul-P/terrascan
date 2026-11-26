"""Step 8.6 (c): pseudo-labelling with tier-3 labels. Rule: configs/pseudo_labels.yaml.

    python -m src.pseudo_labels --config configs/pseudo_labels.yaml --fast-dev-run
    python -m src.pseudo_labels --config configs/pseudo_labels.yaml
Adds attempt "c" to results/india_ablation.json/.md. Tier-3 labels go to data/india_tier3/.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml
from torch.utils.data import ConcatDataset, Dataset

from src.data import CLASSES, EuroSATDataset, build_transforms
from src.error_audit import loao_folds, predict_with_probs
from src.evaluate import load_run
from src.india_ablation import report
from src.india_eval import load_labels, split_by_area
from src.india_finetune import IndiaPatches, finetune, mean_std
from src.train import seed_everything


class Pseudo(Dataset):
    """Pool images with their tier-3 class: (image tensor, class number)."""

    def __init__(self, images, labels, transform):
        self.images, self.labels, self.transform = images, labels, transform

    def __len__(self):
        return len(self.images)

    def __getitem__(self, i):
        img = torch.from_numpy(self.images[i]).permute(2, 0, 1).float() / 255
        return self.transform(img), int(self.labels[i])


@torch.no_grad()
def pseudo_label(model, cfg, images, device, min_conf):
    """(indices kept, their classes, their confidences) for pool images the model is sure about."""
    stats = cfg.get("norm_stats") or json.loads(
        Path(cfg["data"]["stats_path"]).read_text(encoding="utf-8"))
    tf = build_transforms(stats, False, cfg.get("image_size", 64), cfg.get("target_stats"))
    model.to(device).eval()
    probs = []
    for i in range(0, len(images), 128):
        x = torch.stack([tf(torch.from_numpy(im).permute(2, 0, 1).float() / 255)
                         for im in images[i:i + 128]]).to(device)
        probs.append(torch.softmax(model(x).float(), 1).cpu())
    conf, cls = torch.cat(probs).max(1)
    keep = (conf >= min_conf).nonzero().flatten().numpy()
    return keep, cls.numpy()[keep], conf.numpy()[keep]


def save_tier3(path, keep, cls, conf, area, seed):
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, pool_index=keep, label=np.array([CLASSES[c] for c in cls]), confidence=conf,
             tier=np.array(["tier3"] * len(keep)), held_out_area=area, seed=seed)


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    p.add_argument("--fast-dev-run", action="store_true")
    a = p.parse_args(argv)
    cfg = yaml.safe_load(Path(a.config).read_text(encoding="utf-8"))
    pool = np.load(yaml.safe_load(Path(cfg["pool_config"]).read_text(encoding="utf-8"))["out_npz"])
    audit = yaml.safe_load(Path(cfg["error_audit_config"]).read_text(encoding="utf-8"))
    ft = yaml.safe_load(Path(cfg["india_finetune_config"]).read_text(encoding="utf-8"))
    ev = yaml.safe_load(Path(ft["india_eval_config"]).read_text(encoding="utf-8"))
    fast = a.fast_dev_run
    if fast:
        ft = {**ft, "epochs": 1}
    max_batches = 2 if fast else None
    seeds = cfg["seeds"][:1] if fast else cfg["seeds"]
    df, _ = split_by_area(load_labels(ev["reviewed_csv"]), ev["test_areas"], ev["finetune_areas"])
    assert not set(df["area"]) & set(ev["test_areas"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    images = pool["images"]
    acc, n_kept = {}, {}
    for seed in seeds:
        preds_all, rows = [], []
        for area, train_df, held in loao_folds(df):
            labeller, lcfg = load_run(Path("models") / f"{audit['loao_run_prefix']}_{area}"
                                      / f"seed{seed}")
            keep, cls, conf = pseudo_label(labeller, lcfg, images, device, cfg["min_confidence"])
            n_kept[f"{seed}_{area}"] = int(len(keep))
            tag = "-fast-dev-run" if fast else ""
            save_tier3(Path(cfg["pseudo_dir"]) / f"pseudo_{area}_seed{seed}{tag}.npz", keep, cls,
                       conf, area, seed)
            seed_everything(seed)
            model, mcfg = load_run(Path(ft["base_run_dir"]) / f"seed{seed}")
            stats = mcfg.get("norm_stats") or json.loads(
                Path(mcfg["data"]["stats_path"]).read_text(encoding="utf-8"))
            tf = build_transforms(stats, True, mcfg.get("image_size", 64), mcfg.get("target_stats"))
            india = ConcatDataset([IndiaPatches(train_df, ev["patches_dir"], tf),
                                   Pseudo(images[keep], cls, tf)])
            eurosat = EuroSATDataset(Path(mcfg["data"]["splits_dir"]) / "train.csv",
                                     mcfg["data"]["raw_dir"], tf)
            finetune(model, india, eurosat, {**ft, "seed": seed}, device, max_batches)
            pr, _ = predict_with_probs(model, mcfg, held, ev["patches_dir"], device)
            preds_all += pr.tolist()
            rows.append(held)
            print(f"seed {seed}, held out {area}: {len(keep)} pseudo-labels; held-out acc "
                  f"{(pr.numpy() == [CLASSES.index(c) for c in held['final_label']]).mean():.3f}")
        truth = [CLASSES.index(c) for c in pd.concat(rows)["final_label"]]
        acc[seed] = float((np.array(preds_all) == np.array(truth)).mean())
        print(f"seed {seed}: pooled LOAO {acc[seed]:.4f}")
    if fast:
        print("fast dev run: nothing written to results/")
        return
    abl = json.loads(Path(cfg["ablation_json"]).read_text(encoding="utf-8"))
    ref = abl["reference_loao"]
    c = mean_std(list(acc.values()))
    entry = {"id": "c", "what": f"pseudo-labels (tier 3, confidence >= {cfg['min_confidence']})",
             "per_seed": acc, **c, "kept": c["mean"] - ref["mean"] > c["std"] + ref["std"],
             "pseudo_labels_kept_per_fold": n_kept, "config": "configs/pseudo_labels.yaml"}
    abl["attempts"] = [x for x in abl["attempts"] if x["id"] != "c"] + [entry]
    Path(cfg["ablation_json"]).write_text(json.dumps(abl, indent=1), encoding="utf-8")
    Path(cfg["ablation_md"]).write_text(report(abl), encoding="utf-8")
    print(json.dumps({"c": c, "kept": entry["kept"]}))


if __name__ == "__main__":
    main()
