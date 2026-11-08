"""Step 6.1: build the Hugging Face model folder (weights + model card).

    python -m src.hf_model --config configs/hf_model.yaml

Every number in the card is read from a results file and filled into src/model_card.md.
Uploading is a separate step (it needs a Hugging Face login).
"""

import argparse
import json
import shutil
from pathlib import Path

import yaml

from src.classes import CLASSES


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def mean_std(entry):
    """'0.4486 ± 0.0071' from {'mean': .., 'std': ..}."""
    return f"{entry['mean']:.4f} ± {entry['std']:.4f}"


def points(a, b):
    """Difference b - a in percentage points, 1 decimal, with sign."""
    return f"{(b - a) * 100:.1f}"


def per_class_rows(per_class):
    """Table rows for the classes that have test patches (F1 is None when the class is absent)."""
    rows = []
    for name in CLASSES:
        c = per_class[name]
        if c["true_count"] == 0:
            continue
        rows.append(f"| {name} | {c['true_count']} | {c['predicted_count']} | {c['f1']:.2f} |")
    return "\n".join(rows)


def build_numbers(cfg):
    """All the values the card template needs, each read from a results file."""
    res = {k: load_json(v) for k, v in cfg["results"].items()}
    seed = str(cfg["seed"])
    after = res["india_after"]
    summary = after["summary_mean_std_over_seeds"]
    seed_after = after["per_seed"][seed]["india_test_after"]
    check = res["change_check"]
    dataset = res["india_dataset"]

    ib = summary["india_test_accuracy_before"]
    ia = summary["india_test_accuracy_after"]
    eb = summary["eurosat_test_accuracy_before"]
    ea = summary["eurosat_test_accuracy_after"]

    # The Indian-only first try (no EuroSAT mixed in): its EuroSAT validation accuracies, per seed.
    nomix = [
        load_json(Path(after["finetuned_run_dir"] + "_nomix") / f"seed{s}" / "metrics.json")[
            "eurosat_val_acc_after"
        ]
        for s in after["seeds"]
    ]
    base = res["base_eval"]["seeds"][seed]
    lo, hi = check["final"]["real_rate_95"]
    real_lo, real_hi = check["estimated_real_changed_km2_95"]
    change = res["change"]
    recipe = after["recipe"]

    return {
        "license_id": cfg["license"],
        "license_upper": cfg["license_name"],
        "repo_id": cfg["repo_id"],
        "dataset_repo": cfg["dataset_repo"],
        "n_india_test": after["n_india_test_patches"],
        "n_finetune": after["n_finetune_patches"],
        "n_eurosat_test": base["n_test_images"],
        "india_acc_before": mean_std(ib),
        "india_acc_after": mean_std(ia),
        "india_f1_before": mean_std(summary["india_test_macro_f1_before"]),
        "india_f1_after": mean_std(summary["india_test_macro_f1_after"]),
        "eurosat_acc_before": mean_std(eb),
        "eurosat_acc_after": mean_std(ea),
        "india_gain_points": points(ib["mean"], ia["mean"]),
        "eurosat_drop_points": points(ea["mean"], eb["mean"]),
        "india_wrong_pct": f"{(1 - ia['mean']) * 100:.0f}%",
        "india_acc_seed": f"{seed_after['accuracy']:.4f}",
        "india_acc_seed_range": "{:.2f}-{:.2f}".format(*seed_after["accuracy_95_range"]),
        "per_class_rows": per_class_rows(seed_after["per_class"]),
        "n_test_classes": sum(1 for v in dataset["per_class_test"].values() if v > 0),
        "train_pasture": dataset["per_class_train"]["Pasture"],
        "train_forest": dataset["per_class_train"]["Forest"],
        "train_herb": dataset["per_class_train"]["HerbaceousVegetation"],
        "onnx_diff": f"{res['onnx_check']['max_abs_logit_difference']:.1e}",
        "cpu_ms": f"{base['cpu_ms_per_image']:.1f}",
        "eurosat_per_epoch": recipe["eurosat_images_per_epoch"],
        "ft_lr": recipe["lr"],
        "ft_epochs": recipe["epochs"],
        "ft_batch": recipe["batch_size"],
        "nomix_low": f"{min(nomix):.2f}",
        "nomix_high": f"{max(nomix):.2f}",
        "n_change_patches": change["n_patches"],
        "reported_changed_km2": f"{check['reported_changed_km2']:.0f}",
        "real_rate": f"{check['final']['real_rate'] * 100:.0f}%",
        "real_rate_range": f"{lo * 100:.0f}%-{hi * 100:.0f}%",
        "real_km2": f"{check['estimated_real_changed_km2']:.0f}",
        "real_km2_range": f"{real_lo:.0f}-{real_hi:.0f} km2",
        "n_changed_by_user": check["n_changed_by_user"],
    }


def make_card(numbers, template):
    return template.format(**numbers)


def build_folder(cfg, card):
    out = Path(cfg["out_dir"])
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in cfg["files"]:
        shutil.copy2(Path(cfg["model_dir"]) / name, out / name)
    (out / "README.md").write_text(card, encoding="utf-8")
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    numbers = build_numbers(cfg)
    template = Path(cfg["card_template"]).read_text(encoding="utf-8")
    out = build_folder(cfg, make_card(numbers, template))
    print(json.dumps({k: v for k, v in numbers.items() if k != "per_class_rows"}, indent=2))
    print(f"Model folder: {out}")


if __name__ == "__main__":
    main()
