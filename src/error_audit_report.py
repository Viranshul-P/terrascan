"""Step 8.1 part 2: turn the saved predictions into results/error_audit.md and .json.

Only the Indian FINE-TUNE areas are used. Numbers come from results/error_audit_predictions.csv,
data/india/*, data/stats.json, the showcase patch tables and ESA WorldCover (tier 2, a noisy
reference).
"""

import json
import re
import statistics
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from src.data import CLASSES, read_image

# ---------- small helpers (tested) ----------


def confusion_counts(df):
    """10 x 10 count table (row = true class, column = predicted) from a predictions table."""
    matrix = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
    for true, pred in zip(df["true"], df["pred"]):
        matrix[CLASSES.index(true), CLASSES.index(pred)] += 1
    return matrix


def top_pairs(matrix, k):
    """The k most frequent mistakes as (true class, predicted class, count), biggest first.
    Ties are broken by class order, so the result is repeatable."""
    mistakes = [
        (CLASSES[t], CLASSES[p], int(matrix[t, p]))
        for t in range(len(CLASSES))
        for p in range(len(CLASSES))
        if t != p and matrix[t, p] > 0
    ]
    return sorted(mistakes, key=lambda m: -m[2])[:k]


def accuracy_table(df):
    """Accuracy per seed, and mean +- sample std over seeds. df has columns true, pred, seed."""
    per_seed = {int(s): float((g["true"] == g["pred"]).mean()) for s, g in df.groupby("seed")}
    values = list(per_seed.values())
    std = statistics.stdev(values) if len(values) > 1 else 0.0
    return {"per_seed": per_seed, "mean": statistics.mean(values), "std": std}


def pick_cases(loao_seed_df, n_pairs, n_river):
    """Failure cases by the rule in configs/error_audit.yaml (no picking by eye).

    The n_pairs most frequent (true -> predicted) mistakes of this one seed, each shown by its wrong
    patch with the highest confidence; then up to n_river wrong River-labelled patches (most
    confident first) that are not already in the list.
    """
    wrong = loao_seed_df[loao_seed_df["true"] != loao_seed_df["pred"]]
    cases = []
    for true, pred, _ in top_pairs(confusion_counts(loao_seed_df), n_pairs):
        group = wrong[(wrong["true"] == true) & (wrong["pred"] == pred)]
        best = group.sort_values(["conf", "file"], ascending=[False, True]).iloc[0]
        cases.append({**best.to_dict(), "why": f"top mistake {true} -> {pred}"})
    taken = {c["file"] for c in cases}
    river = wrong[(wrong["true"] == "River") & ~wrong["file"].isin(taken)]
    river = river.sort_values(["conf", "file"], ascending=[False, True]).head(n_river)
    for _, row in river.iterrows():
        cases.append({**row.to_dict(), "why": "River patch called something else"})
    return cases


def nearest_square(lat, lon, squares):
    """The showcase square whose centre is closest to (lat, lon), and the distance in metres.
    Plain flat-earth maths: fine over a few hundred metres."""
    dy = (squares["lat"] - lat) * 110_540
    dx = (squares["lon"] - lon) * 111_320 * np.cos(np.radians(lat))
    dist = np.hypot(dx, dy)
    i = int(dist.values.argmin())
    return squares.iloc[i], float(dist.iloc[i])


def pooled_channel_stats(images):
    """Mean and std per colour over all pixels of a list of (3, H, W) tensors with values 0-1.
    All images must have the same size."""
    means = np.array([im.mean(dim=(1, 2)).numpy() for im in images])  # (n, 3)
    variances = np.array([im.var(dim=(1, 2), unbiased=False).numpy() for im in images])
    mean = means.mean(axis=0)
    std = np.sqrt((variances + means**2).mean(axis=0) - mean**2)
    return mean.tolist(), std.tolist()


def files_named_in(text):
    """Patch file names (Indian patch PNGs) mentioned in a text."""
    return sorted(set(re.findall(r"[a-z_]+_r\d{4}_c\d{4}\.png", text)))


def check_files_exist(text, patches_df):
    """Stop if the text names a patch file that is not in the patch table."""
    missing = [f for f in files_named_in(text) if f not in set(patches_df["file"])]
    assert not missing, f"patch files named in the report but not in the patch table: {missing}"


def md_table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def matrix_markdown(matrix):
    """Confusion matrix as a markdown table, keeping only classes that occur as a row or column."""
    keep = [c for c in range(len(CLASSES)) if matrix[c].sum() or matrix[:, c].sum()]
    header = ["true \\ predicted"] + [CLASSES[c] for c in keep] + ["total"]
    rows = [[CLASSES[t]] + [int(matrix[t, p]) for p in keep] + [int(matrix[t].sum())] for t in keep]
    return md_table(header, rows)


# ---------- parts that read files ----------


def brightness_section(cfg, eval_cfg, finetune_df, predictions, patches_csv):
    """Per-colour mean/std of Indian fine-tune-area patches against EuroSAT train (stats.json),
    per class against a seeded EuroSAT sample, and right vs wrong predictions."""
    stats = json.loads(Path("data/stats.json").read_text(encoding="utf-8"))
    patches_dir = eval_cfg["patches_dir"]
    all_ft = patches_csv[patches_csv["area"].isin(eval_cfg["finetune_areas"])]
    images = [read_image(Path(patches_dir) / f) for f in all_ft["file"]]
    mean, std = pooled_channel_stats(images)
    out = {
        "eurosat_train_mean": stats["mean"],
        "eurosat_train_std": stats["std"],
        "india_all_finetune_patches": {"n": len(images), "mean": mean, "std": std},
        "gap_in_eurosat_std": [(m - e) / s for m, e, s in zip(mean, stats["mean"], stats["std"])],
    }
    per_area = {}
    for area, group in all_ft.groupby("area"):
        a_imgs = [read_image(Path(patches_dir) / f) for f in group["file"]]
        a_mean, a_std = pooled_channel_stats(a_imgs)
        per_area[area] = {"n": len(a_imgs), "mean": a_mean, "std": a_std}
    out["per_area"] = per_area

    # per class: Indian labelled patches vs a seeded EuroSAT train sample of the same class
    train = pd.read_csv("data/splits/train.csv")
    raw_dir = Path("data/raw")
    rng = np.random.default_rng(cfg["eurosat_sample_seed"])
    per_class = {}
    for cls in CLASSES:
        ind_files = finetune_df[finetune_df["final_label"] == cls]["file"].tolist()
        if len(ind_files) < cfg["min_indian_patches_for_class_brightness"]:
            continue
        pool = train[train["label"] == cls]["path"].tolist()
        pick = rng.choice(
            len(pool), size=min(cfg["eurosat_sample_per_class"], len(pool)), replace=False
        )
        e_imgs = [read_image(raw_dir / pool[i]) for i in pick]
        i_imgs = [read_image(Path(patches_dir) / f) for f in ind_files]
        e_mean, _ = pooled_channel_stats(e_imgs)
        i_mean, _ = pooled_channel_stats(i_imgs)
        per_class[cls] = {
            "n_india": len(i_imgs),
            "n_eurosat": len(e_imgs),
            "india_mean": i_mean,
            "eurosat_mean": e_mean,
        }
    out["per_class"] = per_class

    # right vs wrong, EuroSAT-only model, seed 42
    ps = predictions[(predictions["model"] == "eurosat") & (predictions["seed"] == 42)]
    bright = {}
    for f in ps["file"]:
        bright[f] = float(read_image(Path(patches_dir) / f).mean())
    ps = ps.assign(brightness=ps["file"].map(bright), right=ps["true"] == ps["pred"])
    out["right_vs_wrong_eurosat_seed42"] = {
        "right": {
            "n": int(ps["right"].sum()),
            "mean_brightness": float(ps[ps["right"]]["brightness"].mean()),
        },
        "wrong": {
            "n": int((~ps["right"]).sum()),
            "mean_brightness": float(ps[~ps["right"]]["brightness"].mean()),
        },
    }
    return out


def worldcover_section(cfg, imagery_cfg):
    """ESA WorldCover (tier 2, noisy reference) class shares inside each fine-tune area box.
    If the data can't be reached the result holds the error, so the report says so instead of
    inventing numbers."""
    try:
        import planetary_computer
        import pystac_client
        import rasterio
        from rasterio.warp import transform_bounds
        from rasterio.windows import from_bounds

        from src.imagery import STAC_URL

        catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
        wc = cfg["worldcover"]
        out = {"collection": wc["collection"], "year": wc["year"], "areas": {}}
        for area in imagery_cfg["areas"]:
            if area["name"] not in cfg["_finetune_areas"]:
                continue
            bbox = area["bbox"]
            items = list(catalog.search(collections=[wc["collection"]], bbox=bbox).items())
            items = [i for i in items if i.properties["start_datetime"].startswith(str(wc["year"]))]
            assert items, f"no WorldCover tile for {area['name']}"
            item = items[0]
            classes = {
                c["value"]: c["description"]
                for c in item.assets["map"].extra_fields["classification:classes"]
            }
            with rasterio.open(item.assets["map"].href) as src:
                b = transform_bounds("EPSG:4326", src.crs, *bbox)
                window = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
                data = src.read(1, window=window)
            values, counts = np.unique(data, return_counts=True)
            out["areas"][area["name"]] = {
                "tile": item.id,
                "n_pixels": int(data.size),
                "share": {
                    classes.get(int(v), str(v)): float(c / data.size)
                    for v, c in zip(values, counts)
                },
            }
        return out
    except Exception as err:  # network or library problem: say so in the report
        return {"error": f"{type(err).__name__}: {err}"}


def square_share(data, bbox, lat, lon, value, half_m=320):
    """Share of pixels equal to `value` inside the square (640 m wide) centred on (lat, lon).

    data: 2D class array that covers bbox [west, south, east, north] on a regular lon/lat grid
    (ESA WorldCover is EPSG:4326). Flat-earth maths, good to about a pixel.
    """
    west, south, east, north = bbox
    h, w = data.shape
    dlat = half_m / 110_540
    dlon = half_m / (111_320 * np.cos(np.radians(lat)))
    c0 = max(0, int((lon - dlon - west) / (east - west) * w))
    c1 = min(w, int(np.ceil((lon + dlon - west) / (east - west) * w)))
    r0 = max(0, int((north - (lat + dlat)) / (north - south) * h))
    r1 = min(h, int(np.ceil((north - (lat - dlat)) / (north - south) * h)))
    window = data[r0:r1, c0:c1]
    return float((window == value).mean()) if window.size else float("nan")


def live_site_vs_worldcover(cfg, bbox):
    """What the deployed model calls (2026) the squares that ESA WorldCover (tier 2, noisy) says are
    mostly water, or mostly built-up. Answers "did the live site call the river crop?" for the whole
    Ahmedabad map, not just the 2 labelled Sabarmati patches. Errors are returned, not hidden."""
    try:
        import planetary_computer
        import pystac_client
        import rasterio
        from rasterio.warp import transform_bounds
        from rasterio.windows import bounds as window_bounds
        from rasterio.windows import from_bounds

        from src.imagery import STAC_URL

        wc = cfg["worldcover"]
        catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
        items = list(catalog.search(collections=[wc["collection"]], bbox=bbox).items())
        items = [i for i in items if i.properties["start_datetime"].startswith(str(wc["year"]))]
        item = items[0]
        values_of = {
            c["description"]: c["value"]
            for c in item.assets["map"].extra_fields["classification:classes"]
        }
        with rasterio.open(item.assets["map"].href) as src:
            b = transform_bounds("EPSG:4326", src.crs, *bbox)
            window = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            data = src.read(1, window=window)
            used = window_bounds(window, src.transform)
        squares = pd.read_csv("web/public/data/ahmedabad/patches.csv")
        min_share = {
            "Permanent water bodies": cfg["worldcover_water_min_share"],
            "Built-up": cfg["worldcover_built_up_min_share"],
        }
        out = {"min_share": min_share, "n_squares": len(squares)}
        for name in ["Permanent water bodies", "Built-up"]:
            shares = np.array(
                [
                    square_share(data, used, r.lat, r.lon, values_of[name])
                    for r in squares.itertuples()
                ]
            )
            chosen = squares[shares >= min_share[name]]
            counts = chosen["class_2026"].value_counts()
            out[name] = {
                "n_squares": int(len(chosen)),
                "live_site_class_2026": {k: int(v) for k, v in counts.items()},
            }
        return out
    except Exception as err:
        return {"error": f"{type(err).__name__}: {err}"}


def case_pictures(cases, patches_dir, out_dir, scale):
    """Save each case patch enlarged with sharp pixels. Returns {file: picture path}."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for f in dict.fromkeys(c["file"] for c in cases):
        im = Image.open(Path(patches_dir) / f).convert("RGB")
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        target = out_dir / f
        im.save(target)
        paths[f] = target.as_posix()
    return paths


def fmt(x, digits=3):
    return f"{x:.{digits}f}"


def build_report(cfg, eval_cfg, finetune_df):
    """Write results/error_audit.json and results/error_audit.md."""
    import yaml

    from src.error_audit import assert_no_test_areas

    assert_no_test_areas(finetune_df, eval_cfg["test_areas"])
    cfg = {**cfg, "_finetune_areas": eval_cfg["finetune_areas"]}
    predictions = pd.read_csv(cfg["predictions_path"])
    assert_no_test_areas(predictions, eval_cfg["test_areas"])
    patches_csv = pd.read_csv("data/india/patches.csv")
    imagery_cfg = yaml.safe_load(Path(cfg["imagery_config"]).read_text(encoding="utf-8"))
    patches_dir = eval_cfg["patches_dir"]
    seeds = cfg["seeds"]

    result = {
        "finetune_areas": eval_cfg["finetune_areas"],
        "seeds": seeds,
        "n_patches": len(finetune_df),
    }

    # 1. accuracy and confusion matrices
    kinds = {
        "eurosat": "EuroSAT-only model (never saw these patches)",
        "loao": "Fine-tuned, leave-one-area-out (never saw the held-out area)",
    }
    result["accuracy"], result["matrix"], result["top_pairs"], result["per_area_accuracy"] = (
        {},
        {},
        {},
        {},
    )
    for kind in kinds:
        d = predictions[predictions["model"] == kind]
        result["accuracy"][kind] = accuracy_table(d)
        m = confusion_counts(d)
        result["matrix"][kind] = m.tolist()
        result["top_pairs"][kind] = top_pairs(m, 8)
        result["per_area_accuracy"][kind] = {
            area: accuracy_table(g) for area, g in d.groupby("area")
        }
    # per-class recall pooled over seeds
    result["per_class_recall"] = {}
    for kind in kinds:
        m = np.array(result["matrix"][kind])
        result["per_class_recall"][kind] = {
            CLASSES[c]: {
                "true_count": int(m[c].sum()),
                "recall": float(m[c, c] / m[c].sum()) if m[c].sum() else None,
            }
            for c in range(len(CLASSES))
            if m[c].sum()
        }

    # 2. failure cases
    loao42 = predictions[
        (predictions["model"] == "loao") & (predictions["seed"] == cfg["case_seed"])
    ]
    eur42 = predictions[
        (predictions["model"] == "eurosat") & (predictions["seed"] == cfg["case_seed"])
    ]
    cases = pick_cases(loao42, cfg["case_pairs"], cfg["case_river"])
    coords = patches_csv.set_index("file")[["lat", "lon"]]
    eur_lookup = eur42.set_index("file")
    for c in cases:
        c["lat"], c["lon"] = (
            float(coords.loc[c["file"], "lat"]),
            float(coords.loc[c["file"], "lon"]),
        )
        c["eurosat_pred"] = eur_lookup.loc[c["file"], "pred"]
        c["eurosat_conf"] = float(eur_lookup.loc[c["file"], "conf"])
    pictures = case_pictures(cases, patches_dir, cfg["case_dir"], cfg["case_picture_scale"])
    result["cases"] = cases

    # 2b. every River-labelled patch (the Sabarmati report), with the live site's class
    squares = pd.read_csv("web/public/data/ahmedabad/patches.csv")
    river_rows = []
    for f in finetune_df[finetune_df["final_label"] == "River"]["file"]:
        row = {
            "file": f,
            "area": finetune_df.set_index("file").loc[f, "area"],
            "lat": float(coords.loc[f, "lat"]),
            "lon": float(coords.loc[f, "lon"]),
        }
        e = eur42.set_index("file").loc[f]
        row["eurosat_pred"], row["eurosat_conf"] = e["pred"], float(e["conf"])
        row["eurosat_right_seeds"] = int(
            (
                (predictions["model"] == "eurosat")
                & (predictions["file"] == f)
                & (predictions["pred"] == "River")
            ).sum()
        )
        lo = loao42.set_index("file").loc[f]
        row["loao_pred"], row["loao_conf"] = lo["pred"], float(lo["conf"])
        row["loao_right_seeds"] = int(
            (
                (predictions["model"] == "loao")
                & (predictions["file"] == f)
                & (predictions["pred"] == "River")
            ).sum()
        )
        if row["area"] == "ahmedabad_city":
            sq, dist = nearest_square(row["lat"], row["lon"], squares)
            row["live_site_class_2026"] = sq["class_2026"]
            row["live_site_conf_2026"] = float(sq["confidence_2026"])
            row["live_site_distance_m"] = dist
        river_rows.append(row)
    pictures.update(
        case_pictures(
            [{"file": r["file"]} for r in river_rows],
            patches_dir,
            cfg["case_dir"],
            cfg["case_picture_scale"],
        )
    )
    result["river_patches"] = river_rows

    # 3. class occurrence
    counts = (
        pd.crosstab(finetune_df["final_label"], finetune_df["area"])
        .reindex(CLASSES)
        .fillna(0)
        .astype(int)
    )
    labels_all = json.loads(Path("results/india_labels.json").read_text(encoding="utf-8"))
    result["class_counts_finetune_areas"] = counts.to_dict()
    result["labels_all_areas_source"] = "results/india_labels.json"
    result["labels_all_areas"] = labels_all.get("per_class", labels_all)
    result["worldcover"] = worldcover_section(cfg, imagery_cfg)
    change_cfg = yaml.safe_load(Path(cfg["change_config"]).read_text(encoding="utf-8"))
    result["live_site_vs_worldcover"] = live_site_vs_worldcover(cfg, change_cfg["bbox"])

    # 4. brightness
    result["brightness"] = brightness_section(cfg, eval_cfg, finetune_df, predictions, patches_csv)

    # report
    Path(cfg["json_path"]).write_text(
        json.dumps(result, indent=2, default=float) + "\n", encoding="utf-8"
    )
    md = render_markdown(cfg, result, kinds, pictures)
    check_files_exist(md, patches_csv)
    Path(cfg["report_path"]).write_text(md, encoding="utf-8")
    print(f"Saved {cfg['json_path']} and {cfg['report_path']}")


def render_markdown(cfg, r, kinds, pictures):
    out = ["# Step 8.1: error audit on Indian land", ""]
    out.append(
        "Evidence only, no retraining to improve anything. Only the three Indian FINE-TUNE areas "
        f"({', '.join(r['finetune_areas'])}; {r['n_patches']} labelled patches, labels = the "
        "user's `final_label`) are used for any claim of cause. The two TEST areas were scored in "
        "4.3/4.4 and "
        "are not used here. Every number below comes from `results/error_audit.json`, built from "
        "`results/error_audit_predictions.csv` (by `src/error_audit.py`).\n"
    )

    out.append("## 1. How wrong, and where\n")
    rows = []
    for kind, label in kinds.items():
        a = r["accuracy"][kind]
        rows.append(
            [
                label,
                fmt(a["mean"], 4),
                fmt(a["std"], 4),
                ", ".join(f"{s}: {fmt(v)}" for s, v in a["per_seed"].items()),
            ]
        )
    out.append(md_table(["model", "accuracy (mean over seeds)", "std", "per seed"], rows))
    out.append("")
    out.append("Per held-out area (mean ± std over seeds):\n")
    areas = r["finetune_areas"]
    rows = []
    for kind, label in kinds.items():
        rows.append(
            [label]
            + [
                f"{fmt(acc['mean'])} ± {fmt(acc['std'])}"
                for a in areas
                for acc in [r["per_area_accuracy"][kind][a]]
            ]
        )
    out.append(md_table(["model"] + areas, rows))
    out.append("")
    out.append(
        "The TEST-area numbers for context only (not used for any claim here): "
        "`results/india_before.json` and `results/india_after.json`. The LOAO model is trained "
        "on only two areas, so it has fewer Indian patches than the 149-patch model of 4.4; "
        "its accuracy is not comparable to the 4.4 test number.\n"
    )

    for kind, label in kinds.items():
        out.append(f"### Confusion matrix: {label}\n")
        out.append(
            "Rows = true class (the user's label), columns = predicted. Counts add up the "
            f"{len(r['seeds'])} seeds, so each patch is counted {len(r['seeds'])} times.\n"
        )
        out.append(matrix_markdown(np.array(r["matrix"][kind])))
        out.append("")
        out.append(
            "Most frequent mistakes: "
            + "; ".join(f"{t} → {p} ({n})" for t, p, n in r["top_pairs"][kind])
            + ".\n"
        )
        rec = r["per_class_recall"][kind]
        out.append(
            "Share right per true class (patches × seeds): "
            + "; ".join(f"{c} {fmt(v['recall'], 2)} of {v['true_count']}" for c, v in rec.items())
            + ".\n"
        )

    out.append("## 2. Failure cases (picked by the rule in `configs/error_audit.yaml`)\n")
    out.append(
        f"Model: LOAO, seed {cfg['case_seed']} (the held-out area's patch was never in its "
        "training). Pictures are the patches enlarged 4× (640 m × 640 m on the ground), "
        "files in `reports/error_audit/`.\n"
    )
    rows = []
    for c in r["cases"]:
        rows.append(
            [
                f"`{c['file']}`",
                f"{c['lat']:.5f}, {c['lon']:.5f}",
                c["true"],
                c["pred"],
                fmt(c["conf"], 2),
                f"{c['eurosat_pred']} ({fmt(c['eurosat_conf'], 2)})",
                c["why"],
            ]
        )
    out.append(
        md_table(
            [
                "patch file",
                "lat, lon",
                "true label",
                "LOAO predicted",
                "confidence",
                "EuroSAT-only predicted (conf.)",
                "why listed",
            ],
            rows,
        )
    )
    out.append("")
    for c in r["cases"]:
        out.append(f"![{c['file']}](../{pictures[c['file']]})")
    out.append("")

    out.append("### The Sabarmati report: every River-labelled patch\n")
    out.append(
        "The user saw the Sabarmati river predicted as crop on the live site. All River labels "
        "in the fine-tune areas are below. Seeds right = out of "
        f'{len(r["seeds"])}. "Live site" = the class the deployed model (fine-tuned on all '
        "three fine-tune areas, so these patches were IN its training data) gives the nearest "
        "2026 square of `web/public/data/ahmedabad/patches.csv`.\n"
    )
    rows = []
    for p in r["river_patches"]:
        live = (
            "-"
            if "live_site_class_2026" not in p
            else f"{p['live_site_class_2026']} ({fmt(p['live_site_conf_2026'], 2)}, "
            f"{p['live_site_distance_m']:.0f} m away)"
        )
        rows.append(
            [
                f"`{p['file']}`",
                p["area"],
                f"{p['lat']:.5f}, {p['lon']:.5f}",
                f"{p['eurosat_pred']} ({p['eurosat_right_seeds']}/{len(r['seeds'])} right)",
                f"{p['loao_pred']} ({p['loao_right_seeds']}/{len(r['seeds'])} right)",
                live,
            ]
        )
    out.append(
        md_table(
            [
                "patch file",
                "area",
                "lat, lon",
                "EuroSAT-only, seed 42",
                "LOAO, seed 42",
                "live site 2026",
            ],
            rows,
        )
    )
    out.append("")
    for p in r["river_patches"]:
        out.append(f"![{p['file']}](../{pictures[p['file']]})")
    out.append("")

    out.append("### The live site along the river and in the city (whole Ahmedabad map)\n")
    lw = r["live_site_vs_worldcover"]
    if "error" in lw:
        out.append(f"Could not be computed in this run: {lw['error']}\n")
    else:
        out.append(
            "Only two Sabarmati patches carry a user label, so this uses ESA WorldCover "
            "(tier 2, a noisy reference, NOT ground truth) to find the squares of "
            f"`web/public/data/ahmedabad/patches.csv` ({lw['n_squares']} squares) that are at "
            f"least {lw['min_share']['Permanent water bodies']:.0%} water or at least "
            f"{lw['min_share']['Built-up']:.0%} built-up, and counts what the deployed model "
            "called them in 2026. The river is narrower than a 640 m square, so the water share is "
            "low; a first try at 50% water found only 1 square. The deployed model was "
            "fine-tuned on `ahmedabad_city`, so some of these squares are in its training data.\n"
        )
        for name in ["Permanent water bodies", "Built-up"]:
            d = lw[name]
            counts = ", ".join(f"{k} {v}" for k, v in d["live_site_class_2026"].items())
            out.append(f"- WorldCover {name}: {d['n_squares']} squares; live site says: {counts}.")
        out.append("")

    out.append("## 3. Which classes occur in Gujarat?\n")
    counts = r["class_counts_finetune_areas"]
    rows = [
        [cls] + [counts[a][cls] for a in areas] + [sum(counts[a][cls] for a in areas)]
        for cls in CLASSES
    ]
    out.append("User labels in the fine-tune areas:\n")
    out.append(md_table(["class"] + areas + ["fine-tune total"], rows))
    out.append("")
    out.append(
        "Totals over all 5 areas, for context (`results/india_labels.json`): "
        + ", ".join(f"{k} {v}" for k, v in r["labels_all_areas"].items())
        + ".\n"
    )
    wc = r["worldcover"]
    if wc and "error" not in wc:
        out.append(
            f"ESA WorldCover {wc['year']} (tier 2, a noisy reference, NOT ground truth), share of "
            "each fine-tune area box by pixels:\n"
        )
        classes = sorted({k for a in wc["areas"].values() for k in a["share"]})
        rows = [
            [k]
            + [
                fmt(wc["areas"][a]["share"].get(k, 0.0), 3) if a in wc["areas"] else "-"
                for a in areas
            ]
            for k in classes
        ]
        out.append(md_table(["WorldCover class"] + areas, rows))
        out.append("")
    else:
        out.append(f"WorldCover could not be read in this run: {wc}\n")

    out.append("## 4. Brightness and colour: does our pipeline still differ from EuroSAT?\n")
    b = r["brightness"]
    names = ["red", "green", "blue"]
    rows = [
        ["EuroSAT train (data/stats.json)"]
        + [fmt(m, 3) for m in b["eurosat_train_mean"]]
        + [fmt(s, 3) for s in b["eurosat_train_std"]]
    ]
    ia = b["india_all_finetune_patches"]
    rows.append(
        [f"Indian fine-tune-area patches (all {ia['n']} cut)"]
        + [fmt(m, 3) for m in ia["mean"]]
        + [fmt(s, 3) for s in ia["std"]]
    )
    for area, v in b["per_area"].items():
        rows.append(
            [f"  {area} ({v['n']})"]
            + [fmt(m, 3) for m in v["mean"]]
            + [fmt(s, 3) for s in v["std"]]
        )
    out.append(md_table(["set"] + [f"mean {n}" for n in names] + [f"std {n}" for n in names], rows))
    out.append("")
    out.append(
        "Gap (Indian mean − EuroSAT mean) in EuroSAT standard deviations, red/green/blue: "
        + ", ".join(fmt(g, 2) for g in b["gap_in_eurosat_std"])
        + ".\n"
    )
    rows = [
        [cls, v["n_india"], v["n_eurosat"]]
        + [fmt(m, 3) for m in v["india_mean"]]
        + [fmt(m, 3) for m in v["eurosat_mean"]]
        for cls, v in b["per_class"].items()
    ]
    out.append("Same class, Indian vs a seeded EuroSAT train sample (mean per colour):\n")
    out.append(
        md_table(
            [
                "class",
                "n India",
                "n EuroSAT",
                "India R",
                "India G",
                "India B",
                "EuroSAT R",
                "EuroSAT G",
                "EuroSAT B",
            ],
            rows,
        )
    )
    out.append("")
    rw = b["right_vs_wrong_eurosat_seed42"]
    out.append(
        "EuroSAT-only model, seed 42: mean brightness (mean of the 3 colours, 0-1) of patches "
        f"it got right {fmt(rw['right']['mean_brightness'])} (n={rw['right']['n']}) vs wrong "
        f"{fmt(rw['wrong']['mean_brightness'])} (n={rw['wrong']['n']}).\n"
    )

    out.append(causes_text(cfg, r))
    return "\n".join(out) + "\n"


def causes_text(cfg, r):
    path = Path(cfg["causes_template"])
    if not path.exists():
        return "## 5. Ranked likely causes\n\n(not written yet)\n"
    return path.read_text(encoding="utf-8").format_map(causes_values(r))


class _Values(dict):
    def __missing__(self, key):
        raise KeyError(f"causes template uses an unknown number: {key}")


def causes_values(r):
    """Numbers for src/error_audit_causes.md, all read from the audit result."""
    v = _Values()
    for kind in ("eurosat", "loao"):
        v[f"{kind}_acc"] = fmt(r["accuracy"][kind]["mean"], 3)
        v[f"{kind}_std"] = fmt(r["accuracy"][kind]["std"], 3)
    ci = CLASSES.index
    m = {k: np.array(r["matrix"][k]) for k in ("eurosat", "loao")}

    def cell(kind, true, pred):
        return int(m[kind][ci(true), ci(pred)])

    def row_total(kind, true):
        return int(m[kind][ci(true)].sum())

    # live site vs WorldCover
    lw = r["live_site_vs_worldcover"]
    assert "error" not in lw, "the causes text needs the WorldCover live-site check"
    water = lw["Permanent water bodies"]
    built = lw["Built-up"]
    v["water_squares"] = water["n_squares"]
    v["water_river"] = water["live_site_class_2026"].get("River", 0)
    v["water_crop"] = water["live_site_class_2026"].get("AnnualCrop", 0)
    v["built_squares"] = built["n_squares"]
    for key, cls in [("res", "Residential"), ("ind", "Industrial"), ("hwy", "Highway")]:
        v[f"built_{key}"] = built["live_site_class_2026"].get(cls, 0)
    v["built_other"] = built["n_squares"] - v["built_res"] - v["built_ind"] - v["built_hwy"]

    # the two labelled Sabarmati patches
    sab = {p["file"]: p for p in r["river_patches"] if p["area"] == "ahmedabad_city"}
    for n, f in [(1, "ahmedabad_city_r0256_c0768.png"), (2, "ahmedabad_city_r0576_c0768.png")]:
        v[f"sab{n}_loao"], v[f"sab{n}_e"] = sab[f]["loao_pred"], sab[f]["eurosat_pred"]

    # cause 1
    v["river_total"] = row_total("eurosat", "River")
    v["river_e_right"] = cell("eurosat", "River", "River")
    v["river_l_right"] = cell("loao", "River", "River")
    assert cell("eurosat", "River", "SeaLake") == cell("loao", "River", "SeaLake")
    v["river_to_sealake"] = cell("loao", "River", "SeaLake")
    v["sealake_labels"] = row_total("eurosat", "SeaLake") // len(r["seeds"])
    v["res_to_ind_e"] = cell("eurosat", "Residential", "Industrial")
    v["ind_to_res_e"] = cell("eurosat", "Industrial", "Residential")
    v["res_to_ind_l"] = cell("loao", "Residential", "Industrial")
    v["ind_to_res_l"] = cell("loao", "Industrial", "Residential")

    # cause 2
    v["crop_n"] = row_total("eurosat", "AnnualCrop")
    v["crop_e_right"] = cell("eurosat", "AnnualCrop", "AnnualCrop")
    v["crop_e_to_perm"] = cell("eurosat", "AnnualCrop", "PermanentCrop")
    v["crop_e_to_pasture"] = cell("eurosat", "AnnualCrop", "Pasture")
    v["crop_l_right"] = cell("loao", "AnnualCrop", "AnnualCrop")
    counts = r["class_counts_finetune_areas"]
    crop_by_area = {a: counts[a]["AnnualCrop"] for a in r["finetune_areas"]}
    total_crop = sum(crop_by_area.values())
    in_training = [total_crop - n for n in crop_by_area.values()]
    v["crop_train_patches"] = f"{min(in_training)} to {max(in_training)}"
    b = r["brightness"]
    v["crop_india_red"] = fmt(b["per_class"]["AnnualCrop"]["india_mean"][0])
    v["crop_eurosat_red"] = fmt(b["per_class"]["AnnualCrop"]["eurosat_mean"][0])
    v["crop_gap_std"] = fmt(
        (
            b["per_class"]["AnnualCrop"]["eurosat_mean"][0]
            - b["per_class"]["AnnualCrop"]["india_mean"][0]
        )
        / b["eurosat_train_std"][0],
        1,
    )

    # cause 3
    for key, cls in [
        ("crop", "AnnualCrop"),
        ("res", "Residential"),
        ("ind", "Industrial"),
        ("hwy", "Highway"),
        ("river", "River"),
        ("perm", "PermanentCrop"),
        ("forest", "Forest"),
        ("herb", "HerbaceousVegetation"),
        ("pasture", "Pasture"),
        ("sealake", "SeaLake"),
    ]:
        v[f"n_{key}"] = sum(counts[a][cls] for a in r["finetune_areas"])
    for key, area in [
        ("ahm", "ahmedabad_city"),
        ("ank", "ankleshwar_industrial"),
        ("nar", "narmada_bharuch"),
    ]:
        v[f"loao_{key}"] = fmt(r["per_area_accuracy"]["loao"][area]["mean"])

    v["n_crop_ank"] = counts["ankleshwar_industrial"]["AnnualCrop"]
    v["n_river_ahm"] = counts["ahmedabad_city"]["River"]

    # cause 4: the AnnualCrop-labelled patch that looks like a town
    case = next(c for c in r["cases"] if c["file"] == "narmada_bharuch_r0512_c0640.png")
    v["r0512_pred"], v["r0512_conf"] = case["pred"], fmt(case["conf"], 2)

    # cause 5
    gap = b["gap_in_eurosat_std"]
    v["gap_red"], v["gap_green"], v["gap_blue"] = (fmt(g, 2) for g in gap)
    v["res_india_red"] = fmt(b["per_class"]["Residential"]["india_mean"][0])
    v["res_eurosat_red"] = fmt(b["per_class"]["Residential"]["eurosat_mean"][0])
    v["bright_ahm"] = fmt(b["per_area"]["ahmedabad_city"]["mean"][0])
    v["bright_nar"] = fmt(b["per_area"]["narmada_bharuch"]["mean"][0])
    return v
