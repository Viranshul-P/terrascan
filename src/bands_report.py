"""Table and decision for step 8.3b: results/bands_comparison.md and .json.

    python -m src.bands_report --config configs/bands_compare.yaml

Reads models/bands_<run>/seed<N>/metrics.json (EuroSAT val) and results/bands_runs/*.csv (Indian
leave-one-area-out predictions). The decision rule is written in configs/bands_compare.yaml; the
functions
`beats`, `verdict` and `choose` below are that rule. Nothing here trains anything.
"""

import argparse
import json
from pathlib import Path

import pandas as pd
import torch
import yaml

from src.bands_train import loao_csv_path, run_channels, uses_extra_bands
from src.data import CLASSES
from src.india_eval import accuracy, present_macro_f1
from src.india_finetune import mean_std


def beats(a, b):
    """a is clearly higher than b: the means differ by more than the two stds added together."""
    return a["mean"] - b["mean"] > a["std"] + b["std"]


def verdict(run, ref):
    """Verdict of one variant against its RGB reference (rule steps 2, 3 and 4 of the config).

    run / ref: {"n_channels", "eurosat_val": {mean, std}, "loao": {"calibrated": {mean, std},
    "uncalibrated": {mean, std}}}. The reference has RGB only, so its one LOAO result serves
    both calibrations.
    Returns (label, reasons): label is "keep", "fragile", "worse" or "no clear gain".
    """
    ref_cal = ref["loao"]["calibrated"]
    ref_uncal = ref["loao"].get("uncalibrated", ref_cal)
    gain_cal = beats(run["loao"]["calibrated"], ref_cal)
    gain_uncal = beats(run["loao"]["uncalibrated"], ref_uncal)
    euro_worse = beats(ref["eurosat_val"], run["eurosat_val"])
    india_worse = beats(ref_cal, run["loao"]["calibrated"]) or beats(
        ref_uncal, run["loao"]["uncalibrated"]
    )
    reasons = [
        f"India gain, calibrated: {'yes' if gain_cal else 'no'}",
        f"India gain, uncalibrated: {'yes' if gain_uncal else 'no'}",
        f"EuroSAT val clearly worse: {'yes' if euro_worse else 'no'}",
    ]
    if india_worse:
        return "worse", reasons
    if gain_cal and gain_uncal and not euro_worse:
        return "keep", reasons
    if (gain_cal or gain_uncal) and not euro_worse:
        return "fragile", reasons
    if gain_cal or gain_uncal:
        return "worse", reasons  # a gain bought with a clear EuroSAT loss
    return "no clear gain", reasons


def choose(table, reference, verdicts):
    """Rule step 5. table: {run: summary}; verdicts: {run: label}. Returns the run kept
    (the reference if no variant passes)."""
    keepers = [r for r, v in verdicts.items() if v == "keep"]
    if not keepers:
        return reference
    best = max(keepers, key=lambda r: table[r]["loao"]["calibrated"]["mean"])
    best_acc = table[best]["loao"]["calibrated"]
    close = [
        r
        for r in keepers
        if r == best
        or not (
            beats(best_acc, table[r]["loao"]["calibrated"])
            or beats(table[r]["loao"]["calibrated"], best_acc)
        )
    ]
    return min(
        close,
        key=lambda r: (table[r]["n_channels"], -table[r]["loao"]["calibrated"]["mean"]),
    )


def loao_scores(csv_path):
    """Pooled accuracy, macro-F1 (classes present only) and per-area accuracy of one LOAO CSV."""
    df = pd.read_csv(csv_path)
    preds = torch.tensor([CLASSES.index(c) for c in df["pred"]])
    labels = torch.tensor([CLASSES.index(c) for c in df["true"]])
    per_area = {area: float((g["pred"] == g["true"]).mean()) for area, g in df.groupby("area")}
    return {
        "accuracy": accuracy(preds, labels),
        "macro_f1": present_macro_f1(preds, labels),
        "per_area": per_area,
        "n_patches": len(df),
    }


def summarise(cfg, bands_cfg):
    """{run: summary} from the files on disk. Raises if a piece is missing (no partial table)."""
    seeds = cfg["seeds"]
    table = {}
    for name, spec in cfg["runs"].items():
        channels = run_channels(spec, bands_cfg)
        metrics = [
            json.loads(
                (Path("models") / f"bands_{name}" / f"seed{s}" / "metrics.json").read_text(
                    encoding="utf-8"
                )
            )
            for s in seeds
        ]
        calibs = cfg["calibrations"] if uses_extra_bands(channels, bands_cfg) else ["calibrated"]
        loao, per_seed = {}, {}
        for calib in calibs:
            scores = [loao_scores(loao_csv_path(cfg, name, calib, s, False)) for s in seeds]
            per_seed[calib] = scores
            loao[calib] = mean_std([x["accuracy"] for x in scores])
        table[name] = {
            "arm": spec["arm"],
            "channels": channels,
            "n_channels": len(channels),
            "eurosat_val": mean_std([m["best_val_acc"] for m in metrics]),
            "eurosat_val_f1": mean_std([m["best_val_f1"] for m in metrics]),
            "eurosat_val_per_seed": [m["best_val_acc"] for m in metrics],
            "train_seconds_per_seed": [m["train_seconds"] for m in metrics],
            "best_epoch_per_seed": [m["best_epoch"] for m in metrics],
            "loao": loao,
            "loao_macro_f1": {c: mean_std([x["macro_f1"] for x in v]) for c, v in per_seed.items()},
            "loao_per_seed": {c: [x["accuracy"] for x in v] for c, v in per_seed.items()},
            "loao_per_area": {
                c: {a: mean_std([x["per_area"][a] for x in v]) for a in sorted(v[0]["per_area"])}
                for c, v in per_seed.items()
            },
            "rgb_only_so_calibration_does_not_matter": "uncalibrated" not in loao,
        }
    return table


def decide(cfg, table):
    """Verdicts and the kept run for each arm."""
    out = {}
    for arm, reference in cfg["references"].items():
        runs = [r for r, t in table.items() if t["arm"] == arm and r != reference]
        verdicts, reasons = {}, {}
        for r in runs:
            verdicts[r], reasons[r] = verdict(table[r], table[reference])
        out[arm] = {
            "reference": reference,
            "verdicts": verdicts,
            "reasons": reasons,
            "kept": choose(table, reference, verdicts),
        }
    return out


def fmt(ms, digits=4):
    return f"{ms['mean']:.{digits}f} ± {ms['std']:.{digits}f}"


def decision_paragraph(cfg, table, decision):
    lines = []
    for arm, d in decision.items():
        ref = d["reference"]
        parts = []
        for r, v in d["verdicts"].items():
            cal = table[r]["loao"]["calibrated"]
            uncal = table[r]["loao"]["uncalibrated"]
            parts.append(
                f"{r}: {v} (India LOAO calibrated {fmt(cal)}, uncalibrated {fmt(uncal)}; "
                f"EuroSAT val {fmt(table[r]['eurosat_val'])})"
            )
        ref_loao = table[ref]["loao"]["calibrated"]
        kept = d["kept"]
        head = (
            f"Arm {arm} (reference {ref}: India LOAO {fmt(ref_loao)}, "
            f"EuroSAT val {fmt(table[ref]['eurosat_val'])}). "
        )
        tail = (
            f" Decision for arm {arm}: **{kept}** stays."
            if kept == ref
            else f" Decision for arm {arm}: **{kept}** is kept."
        )
        lines.append(head + "; ".join(parts) + "." + tail)
    return "\n\n".join(lines)


def write_report(cfg, table, decision):
    seeds = cfg["seeds"]
    md = ["# Step 8.3b: spectral bands, comparison and decision", ""]
    md += [
        "Every number here was computed by `src/bands_train.py` and `src/bands_report.py` from "
        "`models/bands_<run>/seed*/metrics.json` and `results/bands_runs/*.csv` "
        "(summary: `results/bands_comparison.json`).",
        "",
        "**What was measured.** EuroSAT: the 15 % val split of EuroSAT_MS (the test split is "
        "NOT used). "
        "India: leave-one-area-out (LOAO) over the 3 Indian fine-tune areas "
        f"(ahmedabad_city, narmada_bharuch, ankleshwar_industrial), 149 patches pooled; for each "
        f"held-out area the "
        "model is fine-tuned on the other two (4.4 recipe unchanged) and scored on the held-out "
        "one. "
        "The 2 Indian TEST areas were not used for anything here (they were already scored in "
        "4.3/4.4). "
        f"Mean ± sample std over seeds {seeds}. The Indian labels are the hand labels (tier 1).",
        "",
        "## Decision",
        "",
        decision_paragraph(cfg, table, decision),
        "",
        "Rule (from `configs/bands_compare.yaml`, committed before any run): a variant is "
        "better than RGB only "
        "if its mean beats RGB's by more than both stds added together, with calibrated AND "
        "uncalibrated extra "
        "bands, and EuroSAT val not clearly worse; otherwise RGB stays.",
        "",
        "## Table",
        "",
        "| run | arm | channels | EuroSAT val acc | EuroSAT val macro-F1 | India LOAO acc "
        "(calibrated) | "
        "India LOAO acc (uncalibrated) | India LOAO macro-F1 (calibrated) | verdict |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, t in table.items():
        d = decision[t["arm"]]
        v = "reference" if name == d["reference"] else d["verdicts"][name]
        uncal = fmt(t["loao"]["uncalibrated"]) if "uncalibrated" in t["loao"] else "same (RGB only)"
        md.append(
            f"| {name} | {t['arm']} | {t['n_channels']} | {fmt(t['eurosat_val'])} | "
            f"{fmt(t['eurosat_val_f1'])} | {fmt(t['loao']['calibrated'])} | {uncal} | "
            f"{fmt(t['loao_macro_f1']['calibrated'])} | {v} |"
        )
    md += [
        "",
        "## Per seed",
        "",
        "| run | calibration | " + " | ".join(f"seed {s}" for s in seeds) + " |",
        "|---|---|" + "---|" * len(seeds),
    ]
    for name, t in table.items():
        md.append(
            f"| {name} | EuroSAT val | "
            + " | ".join(f"{x:.4f}" for x in t["eurosat_val_per_seed"])
            + " |"
        )
        for calib, vals in t["loao_per_seed"].items():
            md.append(
                f"| {name} | India LOAO, {calib} | " + " | ".join(f"{x:.4f}" for x in vals) + " |"
            )
    md += ["", "## Per held-out area (calibrated), accuracy mean ± std", ""]
    areas = sorted(next(iter(table.values()))["loao_per_area"]["calibrated"])
    md += ["| run | " + " | ".join(areas) + " |", "|---|" + "---|" * len(areas)]
    for name, t in table.items():
        md.append(
            f"| {name} | "
            + " | ".join(fmt(t["loao_per_area"]["calibrated"][a], 3) for a in areas)
            + " |"
        )
    md += [
        "",
        "## Reference numbers from earlier steps (different pipeline, not a like-for-like row)",
        "",
    ]
    base = [
        json.loads(
            Path(f"models/efficientnet_b0/seed{s}/metrics.json").read_text(encoding="utf-8")
        )["best_val_acc"]
        for s in seeds
    ]
    audit = json.loads(Path("results/error_audit.json").read_text(encoding="utf-8"))
    md += [
        f"- 2.4 EfficientNet-B0 on the RGB JPEGs (with colour jitter): EuroSAT val "
        f"{fmt(mean_std(base))} "
        "(from models/efficientnet_b0/seed*/metrics.json).",
        f"- 8.1 LOAO with the 2.4 model on the RGB PNG patches: {fmt(audit['accuracy']['loao'])} "
        "(results/error_audit.json, accuracy.loao).",
        "",
        "## Limits",
        "",
        "- 149 Indian patches from 3 areas, 3 seeds: the std is training noise only, and "
        "Narmada (most River and "
        "crop labels) drives most errors, as in 8.1. A gain or loss smaller than the noise "
        "cannot be seen.",
        "- Indian scenes are one dry-season day per area; extra bands were calibrated on 3 "
        "European summer scenes "
        "(shaky: results/bands_calibration.json) and run uncalibrated as a check. In the "
        "uncalibrated run RGB keeps "
        "its 4.1 calibration, so indices mix calibrated red/green with uncalibrated NIR/SWIR.",
        "- B10 (cirrus) is a constant on both sides, so `all_bands` and `sat_all` effectively "
        "have 12 bands.",
        "- No colour jitter in any run here, so the retrained RGB row differs from the 2.4 model.",
        "- LOAO accuracy on a few patches is rough; macro-F1 is rougher. The decision uses "
        "accuracy only.",
    ]
    Path(cfg["output_md"]).write_text("\n".join(md) + "\n", encoding="utf-8")
    Path(cfg["output_json"]).write_text(
        json.dumps({"seeds": seeds, "table": table, "decision": decision}, indent=2) + "\n",
        encoding="utf-8",
    )


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    bands_cfg = yaml.safe_load(Path(cfg["bands_config"]).read_text(encoding="utf-8"))
    table = summarise(cfg, bands_cfg)
    decision = decide(cfg, table)
    write_report(cfg, table, decision)
    print(decision_paragraph(cfg, table, decision))
    print(f"Wrote {cfg['output_md']} and {cfg['output_json']}")


if __name__ == "__main__":
    main()
