"""Step 6.3: build README.md from src/readme_template.md and the results files.

    python -m src.readme --config configs/readme.yaml

Every number is read from a file in results/ (or models/, through the same code as the model
card) and filled into the template. The one number from outside the repo (what the EuroSAT
authors report) sits in the config with its source.
"""

import argparse
import re
import statistics
from pathlib import Path

import yaml

from src.classes import CLASSES
from src.hf_model import build_numbers, load_json, mean_std


def pct(x, digits=0):
    """0.6831 -> '68%'."""
    return f"{x * 100:.{digits}f}%"


def summarise(values):
    """(mean, sample std) over seeds; std is 0.0 for a single seed."""
    return statistics.mean(values), (statistics.stdev(values) if len(values) > 1 else 0.0)


def ranges_overlap(a, b):
    """True when the mean ± std ranges of a and b = (mean, std) overlap ('about the same')."""
    return a[0] - a[1] <= b[0] + b[1] and b[0] - b[1] <= a[0] + a[1]


def eurosat_rows(names):
    """Table rows + {name: (mean, std)} of test accuracy, from results/<name>.json."""
    rows, acc = [], {}
    for name in names:
        runs = load_json(f"results/{name}.json")["seeds"]
        seeds = sorted(runs, key=int)
        a = summarise([runs[s]["accuracy"] for s in seeds])
        f1 = summarise([runs[s]["macro_f1"] for s in seeds])
        ms = summarise([runs[s]["cpu_ms_per_image"] for s in seeds])
        first = runs[seeds[0]]
        one = len(seeds) == 1
        note = " (1 seed)" if one else ""
        acc[name] = a
        rows.append(
            f"| {name} | {', '.join(seeds)} | {first['image_size']}×{first['image_size']} | "
            f"{first['params']:,} | {a[0]:.4f}{note if one else f' ± {a[1]:.4f}'} | "
            f"{f1[0]:.4f}{note if one else f' ± {f1[1]:.4f}'} | "
            f"{ms[0]:.1f}{note if one else f' ± {ms[1]:.1f}'} |"
        )
    return "\n".join(rows), acc


def audit_numbers(audit):
    """The numbers behind 'Known limitations', all from results/error_audit.json."""
    idx = {c: i for i, c in enumerate(CLASSES)}
    loao = audit["matrix"]["loao"]
    base = audit["matrix"]["eurosat"]

    def cell(m, true, pred):
        return m[idx[true]][idx[pred]]

    def total(m, true):
        return sum(m[idx[true]])

    shares = audit["live_site_vs_worldcover"]["min_share"]
    water = audit["live_site_vs_worldcover"]["Permanent water bodies"]
    built = audit["live_site_vs_worldcover"]["Built-up"]
    return {
        "n_audit_patches": audit["n_patches"],
        "audit_acc_eurosat": mean_std(audit["accuracy"]["eurosat"]),
        "audit_acc_loao": mean_std(audit["accuracy"]["loao"]),
        "res_to_ind": cell(loao, "Residential", "Industrial"),
        "res_total": total(loao, "Residential"),
        "ind_to_res": cell(loao, "Industrial", "Residential"),
        "ind_total": total(loao, "Industrial"),
        "res_to_ind_base": cell(base, "Residential", "Industrial"),
        "river_right": cell(loao, "River", "River"),
        "river_total": total(loao, "River"),
        "river_to_sealake": cell(loao, "River", "SeaLake"),
        "crop_right_base": cell(base, "AnnualCrop", "AnnualCrop"),
        "crop_right_loao": cell(loao, "AnnualCrop", "AnnualCrop"),
        "crop_total": total(loao, "AnnualCrop"),
        "n_squares": audit["live_site_vs_worldcover"]["n_squares"],
        "water_squares": water["n_squares"],
        "water_as_river": water["live_site_class_2026"].get("River", 0),
        "water_as_crop": water["live_site_class_2026"].get("AnnualCrop", 0),
        "built_squares": built["n_squares"],
        "built_as_residential": built["live_site_class_2026"].get("Residential", 0),
        "built_as_industrial": built["live_site_class_2026"].get("Industrial", 0),
        "built_industrial_pct": pct(
            built["live_site_class_2026"].get("Industrial", 0) / built["n_squares"]
        ),
        "min_water": pct(shares["Permanent water bodies"]),
        "min_built": pct(shares["Built-up"]),
    }


def early_stop_numbers(run_dir="models/efficientnet_b0_patience15", max_epochs=50):
    """How many seeds of the patience-15 try stopped early (2.4), from models/<run>/seed*."""
    runs = [load_json(p) for p in sorted(Path(run_dir).glob("seed*/metrics.json"))]
    stopped = [r for r in runs if r["epochs_run"] < max_epochs]
    return {
        "p15_total": len(runs),
        "p15_stopped": len(stopped),
        "p15_epochs": " and ".join(str(r["epochs_run"]) for r in stopped),
        "p15_best": " and ".join(str(r["best_epoch"]) for r in stopped),
    }


def build_readme_numbers(cfg):
    hf_cfg = yaml.safe_load(Path(cfg["hf_config"]).read_text(encoding="utf-8"))
    n = build_numbers(hf_cfg)
    res = {k: load_json(v) for k, v in cfg["results"].items()}
    after = load_json("results/india_after.json")
    s = after["summary_mean_std_over_seeds"]

    table, acc = eurosat_rows(cfg["eurosat_models"])
    best = max(acc, key=lambda k: acc[k][0])
    same_as_best = [k for k in acc if k != best and ranges_overlap(acc[k], acc[best])]
    multi = [k for k in acc if k != "small_cnn_v1"]
    lo, hi = min(acc[k][0] for k in multi), max(acc[k][0] for k in multi)

    n.update(audit_numbers(res["error_audit"]))
    n.update(early_stop_numbers())
    n["real_km2_range"] = n["real_km2_range"].replace("km2", "km²")
    n.update(
        {
            "live_site": cfg["live_site"],
            "github": cfg["github"],
            "model_repo": cfg["model_repo"],
            "dataset_repo": cfg["dataset_repo"],
            "eurosat_table": table,
            "eurosat_best": best,
            "eurosat_best_acc": f"{acc[best][0]:.4f} ± {acc[best][1]:.4f}",
            "eurosat_same_as_best": ", ".join(same_as_best),
            "eurosat_low": pct(lo, 2),
            "eurosat_high": pct(hi, 2),
            "published_acc": f"{cfg['published_eurosat']['accuracy_percent']:.2f}%",
            "published_url": cfg["published_eurosat"]["source_url"],
            "published_checked": str(cfg["published_eurosat"]["checked"]),
            "india_before_pct": pct(s["india_test_accuracy_before"]["mean"]),
            "india_after_pct": pct(s["india_test_accuracy_after"]["mean"]),
            "india_after_std_pts": f"{s['india_test_accuracy_after']['std'] * 100:.0f}",
            "n_labelled": res["india_labels"]["labelled"],
            "n_reviewed": res["india_labels"]["patches_reviewed"],
            "n_skipped": res["india_labels"]["skipped"],
            "n_first_ai": res["india_dataset"]["first_labelled_by"]["claude"],
            "n_first_owner": res["india_dataset"]["first_labelled_by"]["user"],
            "change_n_pairs": load_json("results/change_check.json")["n_pairs"],
            "ft_areas": ", ".join(after["finetune_areas"]),
            "test_areas": ", ".join(after["test_areas"]),
        }
    )
    return n


def make_readme(numbers, template):
    return template.format(**numbers)


def broken_links(text, root="."):
    """Relative links and images in the Markdown that point at files that do not exist."""
    missing = []
    for target in re.findall(r"\]\(([^)\s]+)\)", text):
        if re.match(r"^(https?:|mailto:|#)", target):
            continue
        if not (Path(root) / target.split("#")[0]).exists():
            missing.append(target)
    return missing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    numbers = build_readme_numbers(cfg)
    text = make_readme(numbers, Path(cfg["template"]).read_text(encoding="utf-8"))
    Path(cfg["output"]).write_text(text, encoding="utf-8")
    missing = broken_links(text)
    print(f"Wrote {cfg['output']} ({len(text.split())} words)")
    if missing:
        raise SystemExit(f"Links to files that do not exist: {missing}")


if __name__ == "__main__":
    main()
