"""Error audit on Indian land (step 8.1): why is the model wrong? Nothing is improved here.

Run from the repo root (see configs/error_audit.yaml):
    python -m src.error_audit --config configs/error_audit.yaml --fast-dev-run
    python -m src.error_audit --config configs/error_audit.yaml
    python -m src.error_audit --config configs/error_audit.yaml --report-only

Part 1 (predict): for seeds 42/43/44, two kinds of prediction on the Indian FINE-TUNE-area patches
  - "eurosat": the EuroSAT-only EfficientNet-B0 (it never saw these patches);
  - "loao": leave-one-area-out. For each fine-tune area, fine-tune on the OTHER two areas with the
    unchanged 4.4 recipe, then predict the held-out area.
  All predictions (with confidence) go to one long CSV. The two TEST areas are never used.
Part 2 (report): src/error_audit_report.py reads that CSV and writes results/error_audit.md + .json.
"""

import argparse
import json
from pathlib import Path

import pandas as pd
import torch
import yaml

from src.data import CLASSES, EuroSATDataset, build_transforms, read_image
from src.evaluate import load_run
from src.india_eval import load_labels, split_by_area
from src.india_finetune import IndiaPatches, finetune
from src.train import save_run, seed_everything


def assert_no_test_areas(df, test_areas):
    """Stop if any patch of a TEST area is in df (the audit may not use them)."""
    bad = sorted(set(df["area"]) & set(test_areas))
    assert not bad, f"TEST areas must not be used in the error audit: {bad}"


def loao_folds(finetune_df):
    """[(held-out area, train rows = the other areas, held-out rows)], one fold per area."""
    folds = []
    for area in sorted(set(finetune_df["area"])):
        held_out = finetune_df[finetune_df["area"] == area].reset_index(drop=True)
        train = finetune_df[finetune_df["area"] != area].reset_index(drop=True)
        assert not set(train["file"]) & set(held_out["file"])
        folds.append((area, train, held_out))
    return folds


@torch.no_grad()
def predict_with_probs(model, cfg, df, patches_dir, device):
    """(predicted class numbers, confidence = top softmax probability) for every patch in df.

    Same image size and scaling as the run was trained with (as in india_eval.predict_patches).
    """
    stats = cfg.get("norm_stats") or json.loads(
        Path(cfg["data"]["stats_path"]).read_text(encoding="utf-8")
    )
    transform = build_transforms(stats, False, cfg.get("image_size", 64), cfg.get("target_stats"))
    images = torch.stack([transform(read_image(Path(patches_dir) / f)) for f in df["file"]])
    model.to(device).eval()
    probs = torch.softmax(model(images.to(device)).float(), dim=1).cpu()
    conf, preds = probs.max(dim=1)
    return preds, conf


def prediction_rows(df, model_kind, seed, preds, conf):
    """Long-format rows: one per patch for one (model kind, seed)."""
    return pd.DataFrame(
        {
            "file": df["file"].values,
            "area": df["area"].values,
            "true": df["final_label"].values,
            "model": model_kind,
            "seed": seed,
            "pred": [CLASSES[p] for p in preds.tolist()],
            "conf": [round(c, 4) for c in conf.tolist()],
        }
    )


def run_predictions(cfg, ft_cfg, eval_cfg, finetune_df, seeds, device, max_batches, suffix):
    """Part 1. Returns the long predictions table."""
    rows = []
    patches_dir = eval_cfg["patches_dir"]
    for seed in seeds:
        base, base_cfg = load_run(Path(ft_cfg["base_run_dir"]) / f"seed{seed}")
        preds, conf = predict_with_probs(base, base_cfg, finetune_df, patches_dir, device)
        rows.append(prediction_rows(finetune_df, "eurosat", seed, preds, conf))
        acc = (preds.numpy() == [CLASSES.index(c) for c in finetune_df["final_label"]]).mean()
        print(f"Seed {seed}: EuroSAT-only accuracy on the fine-tune areas {acc:.3f}")

        stats = base_cfg.get("norm_stats") or json.loads(
            Path(base_cfg["data"]["stats_path"]).read_text(encoding="utf-8")
        )
        transform = build_transforms(
            stats, True, base_cfg.get("image_size", 64), base_cfg.get("target_stats")
        )
        eurosat_train = EuroSATDataset(
            Path(base_cfg["data"]["splits_dir"]) / "train.csv",
            base_cfg["data"]["raw_dir"],
            transform,
        )
        for area, train_df, held_out in loao_folds(finetune_df):
            print(f"Seed {seed}, held out {area}: fine-tune on {len(train_df)} patches")
            seed_everything(seed)
            model, cfg_run = load_run(Path(ft_cfg["base_run_dir"]) / f"seed{seed}")
            india = IndiaPatches(train_df, patches_dir, transform)
            history = finetune(
                model, india, eurosat_train, {**ft_cfg, "seed": seed}, device, max_batches
            )
            run_name = f"{cfg['loao_run_prefix']}_{area}{suffix}"
            metrics = {"seed": seed, "held_out_area": area, "n_finetune_patches": len(train_df)}
            run_cfg = {**cfg_run, "run_name": run_name, "finetune": ft_cfg}
            save_run(
                Path("models") / run_name / f"seed{seed}",
                model.state_dict(),
                run_cfg,
                metrics,
                history,
            )
            preds, conf = predict_with_probs(model, cfg_run, held_out, patches_dir, device)
            rows.append(prediction_rows(held_out, "loao", seed, preds, conf))
            truth = [CLASSES.index(c) for c in held_out["final_label"]]
            print(f"  held-out accuracy {(preds.numpy() == truth).mean():.3f}")
    return pd.concat(rows, ignore_index=True)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--fast-dev-run", action="store_true", help="2 batches, 1 epoch, 1 seed")
    parser.add_argument("--report-only", action="store_true", help="skip training, reuse the CSV")
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    ft_cfg = yaml.safe_load(Path(cfg["india_finetune_config"]).read_text(encoding="utf-8"))
    eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))

    df = load_labels(eval_cfg["reviewed_csv"])
    finetune_df, _ = split_by_area(df, eval_cfg["test_areas"], eval_cfg["finetune_areas"])
    assert_no_test_areas(finetune_df, eval_cfg["test_areas"])
    print(f"{len(finetune_df)} fine-tune-area patches (TEST areas not loaded for any claim)")

    predictions_path = Path(cfg["predictions_path"])
    if args.fast_dev_run:
        ft_cfg["epochs"] = 1
        predictions_path = Path("models") / "error_audit-fast-dev-run" / "predictions.csv"
        predictions_path.parent.mkdir(parents=True, exist_ok=True)
    if not args.report_only:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Device: {device}")
        seeds = cfg["seeds"][:1] if args.fast_dev_run else cfg["seeds"]
        table = run_predictions(
            cfg,
            ft_cfg,
            eval_cfg,
            finetune_df,
            seeds,
            device,
            2 if args.fast_dev_run else None,
            "-fast-dev-run" if args.fast_dev_run else "",
        )
        table.to_csv(predictions_path, index=False)
        print(f"Saved {predictions_path} ({len(table)} rows)")
    if args.fast_dev_run:
        return
    from src.error_audit_report import build_report

    build_report(cfg, eval_cfg, finetune_df)


if __name__ == "__main__":
    main()
