"""Tests for src/web_story.py (the Story page's numbers). Small made-up inputs, not results/."""

import pytest

from src.web_story import build, mean_std

CHECK = {
    "judged_by": "Claude first, then the user",
    "n_pairs": 4,
    "final": {
        "counts": {"yes": 2, "no": 1, "unclear": 1},
        "real_rate": 0.5,
        "real_rate_95": [0.2, 0.8],
    },
    "reported_changed_km2": 100.0,
    "estimated_real_changed_km2": 50.0,
    "estimated_real_changed_km2_95": [20.0, 80.0],
    "claude_before_review": {"not": "copied"},
}
AFTER = {
    "seeds": [42, 43, 44],
    "n_finetune_patches": 10,
    "n_india_test_patches": 5,
    "summary_mean_std_over_seeds": {
        "india_test_accuracy_before": {"mean": 0.4, "std": 0.01},
        "india_test_accuracy_after": {"mean": 0.7, "std": 0.03},
        "eurosat_test_accuracy_before": {"mean": 0.98, "std": 0.001},
        "eurosat_test_accuracy_after": {"mean": 0.97, "std": 0.002},
        "india_test_macro_f1_before": {"mean": 0.3, "std": 0.0},
    },
    "per_seed": {"42": {"india_test_accuracy_before": 0.444}},
}


def seed(acc, ms):
    return {"accuracy": acc, "cpu_ms_per_image": ms, "image_size": 64, "params": 1000}


RESULTS = {
    "small": {
        "cpu_threads": 1,
        "timed_runs": 200,
        "seeds": {"42": seed(0.9, 2.0), "43": seed(0.92, 2.2), "44": seed(0.94, 2.4)},
    },
    "one_seed": {"cpu_threads": 1, "timed_runs": 200, "seeds": {"42": seed(0.8, 5.0)}},
}


def test_mean_std_uses_sample_std_and_zero_for_one_seed():
    assert mean_std([1.0, 2.0, 3.0]) == {"mean": 2.0, "std": 1.0}
    assert mean_std([0.5]) == {"mean": 0.5, "std": 0.0}


def test_ahmedabad_numbers_are_copied_with_their_source():
    a = build(CHECK, AFTER, RESULTS)["ahmedabad"]
    assert a["source"] == "results/change_check.json"
    assert a["reported_changed_km2"] == 100.0 and a["estimated_real_changed_km2"] == 50.0
    assert a["estimated_real_changed_km2_95"] == [20.0, 80.0]
    assert a["counts"] == {"yes": 2, "no": 1, "unclear": 1} and a["real_rate"] == 0.5
    assert "claude_before_review" not in a


def test_india_keeps_only_the_three_seed_summary():
    i = build(CHECK, AFTER, RESULTS)["india"]
    s = i["summary_mean_std_over_seeds"]
    # never the seed-42-only number
    assert s["india_test_accuracy_before"] == {"mean": 0.4, "std": 0.01}
    assert "per_seed" not in i and "india_test_macro_f1_before" not in s
    assert i["seeds"] == [42, 43, 44] and i["n_finetune_patches"] == 10


def test_models_keep_table_order_and_average_over_seeds():
    m = build(CHECK, AFTER, RESULTS)["models"]["items"]
    assert [x["name"] for x in m] == ["small", "one_seed"]
    assert m[0]["accuracy"]["mean"] == pytest.approx(0.92)
    assert m[0]["accuracy"]["std"] == pytest.approx(0.02)
    assert m[0]["cpu_ms_per_image"]["mean"] == pytest.approx(2.2)
    assert m[0]["seeds"] == [42, 43, 44] and m[0]["source"] == "results/small.json"
    assert m[1]["accuracy"] == {"mean": 0.8, "std": 0.0}


def test_engineering_copies_values_with_sources():
    from src.web_story import engineering
    e = engineering(
        {"max_abs_logit_difference": 7e-6, "tolerance": 1e-4, "n_images": 20},
        {"summary": {"runs_compared": 8, "squares_compared": 272, "squares_same_class": 272,
                     "all_same_scenes": True, "max_centre_offset_m": 0.0,
                     "median_browser_total_ms": 7406}},
        {"fit_pixels": 3, "fit_areas": {"a": 1, "b": 2}, "gain": [1, 1, 1], "shift": [0, 0, 0]},
        {"patches": 230, "per_split": {"train": 149, "test": 81}})
    assert e["parity"]["squares_same_class"] == 272
    assert e["calibration"]["n_fit_scenes"] == 2
    assert all(v["source"].startswith("results/") for v in e.values())


def test_bands_row_names_the_best_other_input_and_the_decision():
    from src.web_story import bands_row
    ms = lambda m: {"mean": m, "std": 0.01}  # noqa: E731
    r = {"table": {"rgb": {"loao": {"calibrated": ms(0.65)}, "n_channels": 3},
                   "rgb_nir": {"loao": {"calibrated": ms(0.66)}, "n_channels": 4},
                   "all_bands": {"loao": {"calibrated": ms(0.60)}, "n_channels": 13}},
         "decision": {"A": {"reference": "rgb", "verdicts": {"rgb_nir": "x", "all_bands": "y"},
                            "kept": "rgb"}}}
    r["decision"]["A"]["verdicts"] = {"rgb_nir": "no clear gain", "all_bands": "fragile"}
    row = bands_row(r)
    assert "best other input rgb_nir (4 channels) 0.660" in row["result"]
    assert row["decision"] == "RGB stays for the site's model (rgb_nir: no clear gain by the rule)."
