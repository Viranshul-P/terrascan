"""The numbers for the website's Story page (step 5.3c), copied from results/ into one data file.

Reads:
  results/change_check.json  - Ahmedabad: change the model reported vs. the share that held up (4.8)
  results/india_after.json   - India accuracy before/after fine-tuning, 3 seeds (step 4.4)
  results/<model>.json       - EuroSAT test results per model and seed (step 2.5), models listed in
                               configs/evaluate.yaml
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


def build(check, after, results):
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
    }


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main():
    cfg = yaml.safe_load(EVAL_CONFIG.read_text(encoding="utf-8"))
    folder = Path(cfg["results_dir"])
    results = {e["name"]: read(folder / f"{e['name']}.json") for e in cfg["models"]}
    out = build(read(RESULTS / "change_check.json"), read(RESULTS / "india_after.json"), results)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(results)} models)")


if __name__ == "__main__":
    main()
