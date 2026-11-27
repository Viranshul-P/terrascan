"""The numbers for the website's Story page (step 5.3c), copied from results/ into one data file.

Reads:
  results/change_check.json  - Ahmedabad: change the model reported vs. the share that held up (4.8)
  results/india_after.json   - India accuracy before/after fine-tuning, 3 seeds (step 4.4)
  results/<model>.json       - EuroSAT test results per model and seed (step 2.5), models listed in
                               configs/evaluate.yaml
  results/onnx_check.json, browser_parity.json, imagery_calibration.json, india_dataset.json
                             - the Engineering page's numbers (optional: left out if missing)
Writes web/public/data/story.json. The website only reads web/public/, so this copies values;
the only thing computed here is the mean and std over seeds of the per-model results
(same formula as scripts/comparison_table.py: sample std).
    python -m src.web_story
"""

import json
import statistics
from pathlib import Path

import yaml

RESULTS = Path("results")
EVAL_CONFIG = Path("configs/evaluate.yaml")
OUT = Path("web/public/data/story.json")


def mean_std(values):
    """{mean, std} over seeds; std is 0 when there is only one seed."""
    return {
        "mean": statistics.mean(values),
        "std": statistics.stdev(values) if len(values) > 1 else 0.0,
    }


def ahmedabad(check):
    """The step 4.8 numbers the story shows, under their names in results/change_check.json."""
    return {
        "source": "results/change_check.json",
        "judged_by": check["judged_by"],
        "n_pairs": check["n_pairs"],
        "counts": check["final"]["counts"],
        "real_rate": check["final"]["real_rate"],
        "real_rate_95": check["final"]["real_rate_95"],
        "reported_changed_km2": check["reported_changed_km2"],
        "estimated_real_changed_km2": check["estimated_real_changed_km2"],
        "estimated_real_changed_km2_95": check["estimated_real_changed_km2_95"],
    }


def india(after):
    """3-seed India numbers (CLAUDE.md: always the 3-seed 'before', never the seed-42 one)."""
    s = after["summary_mean_std_over_seeds"]
    keep = [
        "india_test_accuracy_before",
        "india_test_accuracy_after",
        "eurosat_test_accuracy_before",
        "eurosat_test_accuracy_after",
    ]
    return {
        "source": "results/india_after.json",
        "seeds": after["seeds"],
        "n_finetune_patches": after["n_finetune_patches"],
        "n_india_test_patches": after["n_india_test_patches"],
        "summary_mean_std_over_seeds": {k: s[k] for k in keep},
    }


def model(name, res):
    """One model's EuroSAT test results, mean and std over its seeds."""
    seeds = res["seeds"]
    first = next(iter(seeds.values()))
    return {
        "name": name,
        "source": f"results/{name}.json",
        "seeds": [int(k) for k in seeds],
        "image_size": first["image_size"],
        "params": first["params"],
        "accuracy": mean_std([s["accuracy"] for s in seeds.values()]),
        "cpu_ms_per_image": mean_std([s["cpu_ms_per_image"] for s in seeds.values()]),
    }


def engineering(onnx, parity, calibration, dataset):
    """Numbers for the Engineering page, copied from their result files (each keeps its source)."""
    s = parity["summary"]
    return {
        "onnx": {"source": "results/onnx_check.json", "max_abs_logit_difference":
                 onnx["max_abs_logit_difference"], "tolerance": onnx["tolerance"],
                 "n_images": onnx["n_images"]},
        "parity": {"source": "results/browser_parity.json",
                   **{k: s[k] for k in ["runs_compared", "squares_compared", "squares_same_class",
                                        "all_same_scenes", "max_centre_offset_m",
                                        "median_browser_total_ms"]}},
        "calibration": {"source": "results/imagery_calibration.json",
                        "fit_pixels": calibration["fit_pixels"],
                        "n_fit_scenes": len(calibration["fit_areas"]),
                        "gain": calibration["gain"], "shift": calibration["shift"]},
        "dataset": {"source": "results/india_dataset.json", "patches": dataset["patches"],
                    "per_split": dataset["per_split"]},
    }


def ms(d):
    return f"{d['mean']:.3f} ± {d['std']:.3f}"


def experiments():
    """The Phase 8 experiments, each with its question, result, decision and source file.

    Only experiments whose result file exists are listed (the rest are still running or not done).
    """
    out = []
    p = RESULTS / "noisy_labels.json"
    if p.exists():
        full = read(p)
        r, n = full["stages"], full["data"]["n_squares"]
        out.append({"question": f"Do {n:,} extra squares labelled from ESA WorldCover help?",
                    "result": f"hand labels only {ms(r['A_hand_only'])}; WorldCover only "
                              f"{ms(r['B_tier2_only'])}; WorldCover then hand "
                              f"{ms(r['C_tier2_then_hand'])}",
                    "decision": "No: coarse map labels made it worse. Hand labels only stay.",
                    "source": "results/noisy_labels.json"})
    p = RESULTS / "india_ablation.json"
    if p.exists():
        r = read(p)
        d = next(a for a in r["attempts"] if a["id"] == "d")
        e = next(a for a in r["attempts"] if a["id"] == "e")
        c = next((a for a in r["attempts"] if a["id"] == "c" and "mean" in a), None)
        out.append({"question": "Average each answer over 8 flips and turns, or over 3 seeds? "
                                "Train on the model's own confident guesses (pseudo-labels)?",
                    "result": f"reference {ms(r['reference_loao'])}; flips/turns {ms(d)}; "
                              f"seed ensemble {e['accuracy']:.3f}"
                              + (f"; pseudo-labels {ms(c)}" if c else ""),
                    "decision": "None kept: each gain is inside the seed-to-seed spread.",
                    "source": "results/india_ablation.json"})
    p = RESULTS / "foundation_models.json"
    if p.exists():
        r = read(p)
        out.append({"question": "Does a frozen satellite foundation model (Prithvi-EO-2.0, "
                                f"{r['candidates'][0]['params_encoder'] / 1e6:.0f}M parameters) "
                                "beat our fine-tuned CNN?",
                    "result": f"linear probe {ms(r['probe']['india_loao'])} vs reference "
                              f"{ms(r['reference_india_loao'])}",
                    "decision": "Better by the rule." if r["better_than_reference"]
                                else "Not better by the rule.",
                    "source": "results/foundation_models.json"})
    p = RESULTS / "bands_comparison.json"
    if p.exists():
        out.append(bands_row(read(p)))
    p = RESULTS / "lst_ahmedabad.json"
    if p.exists():
        r = read(p)["by_class"]
        lo, hi = min(r, key=lambda c: r[c]["median_c"]), max(
            (c for c in r if not r[c]["too_few"]), key=lambda c: r[c]["median_c"])
        out.append({"question": "Extension: how warm is each land use on a winter morning?",
                    "result": f"coolest {lo} {r[lo]['median_c']:.1f} °C, warmest {hi} "
                              f"{r[hi]['median_c']:.1f} °C (median of squares, one Landsat date)",
                    "decision": "Descriptive only; not a main result.",
                    "source": "results/lst_ahmedabad.json"})
    return out


def bands_row(r):
    """The band comparison (8.3b): arm A's reference vs its best other input, and the decision."""
    t, d = r["table"], r["decision"]["A"]
    ref = d["reference"]
    others = [k for k in d["verdicts"]]
    best = max(others, key=lambda k: t[k]["loao"]["calibrated"]["mean"])
    kept = d["kept"]
    return {"question": "Do extra spectral bands (near- and shortwave infrared, indices) help?",
            "result": f"RGB {ms(t[ref]['loao']['calibrated'])}; best other input ({best}, "
                      f"{t[best]['n_channels']} channels) {ms(t[best]['loao']['calibrated'])}",
            "decision": (f"No: RGB stays ({len(others)} other inputs tried)." if kept == ref
                         else f"Better by the rule: {kept} is kept."),
            "source": "results/bands_comparison.json"}


def build(check, after, results, eng=None):
    """story.json as a dict.

    results = {model name: contents of results/<name>.json}, in table order.
    """
    any_res = next(iter(results.values()))
    return {
        "made_by": "src/web_story.py",
        "ahmedabad": ahmedabad(check),
        "india": india(after),
        "models": {
            "note": (
                f"EuroSAT test split. CPU time: model only, batch size 1, "
                f"{any_res['cpu_threads']} CPU thread, median of {any_res['timed_runs']} runs, "
                f"on the training laptop."
            ),
            "items": [model(n, r) for n, r in results.items()],
        },
        **({"engineering": eng} if eng else {}),
    }


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    cfg = yaml.safe_load(EVAL_CONFIG.read_text(encoding="utf-8"))
    folder = Path(cfg["results_dir"])
    results = {e["name"]: read(folder / f"{e['name']}.json") for e in cfg["models"]}
    eng = engineering(*(read(RESULTS / f"{n}.json") for n in
                        ["onnx_check", "browser_parity", "imagery_calibration", "india_dataset"]))
    eng["experiments"] = experiments()
    out = build(read(RESULTS / "change_check.json"), read(RESULTS / "india_after.json"), results,
                eng)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(results)} models)")


if __name__ == "__main__":
    main()
