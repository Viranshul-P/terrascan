"""Class scheme for Indian land (step 8.2): which classes to keep, and how each label source maps.

    python -m src.class_scheme make-quiz --config configs/classes_india.yaml
    python -m src.class_scheme score     --config configs/classes_india.yaml [--answers <csv>]

The decision rule is written at the top of configs/classes_india.yaml. In short: a pair of
classes is merged only if (screen) it is confused both ways in the 8.1 audit and (quiz) a judge,
blind, cannot tell the two classes apart on a random sample of the user's labelled patches.
Accuracy is never a reason.
Only the Indian FINE-TUNE areas are used; the TEST areas are never touched.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from PIL import Image, ImageDraw

from src.data import CLASSES
from src.india_eval import load_labels, split_by_area

IGNORE = "ignore"


# ---------- the scheme and the mappings ----------


def build_scheme(base_classes, merges):
    """The scheme's class list and a dict {EuroSAT class: scheme class}.

    merges = {} means "keep all classes". A merge is {new name: [classes to join]}: it needs at
    least two
    existing classes, a class can be in only one merge, and the new name must not clash with a class
    that is kept as it is.
    """
    merged_away = {}
    for new_name, members in merges.items():
        if len(members) < 2:
            raise ValueError(f"merge {new_name!r} needs at least two classes")
        for c in members:
            if c not in base_classes:
                raise ValueError(f"merge {new_name!r}: unknown class {c!r}")
            if c in merged_away:
                raise ValueError(f"class {c!r} is in two merges")
            merged_away[c] = new_name
    kept = [c for c in base_classes if c not in merged_away]
    for new_name in merges:
        if new_name in kept:
            raise ValueError(f"merge name {new_name!r} clashes with a kept class")
    scheme = kept + list(merges)
    return scheme, {c: merged_away.get(c, c) for c in base_classes}


def derive_mapping(could_mean, to_scheme):
    """The ONE scheme class a source class maps to, or IGNORE.

    could_mean: the EuroSAT classes the source class can mean. If they all land in the same scheme
    class, that is the answer; if they land in several (or the list is empty), the label is
    ambiguous
    or has no class, so it is ignored instead of guessed.
    """
    landing = {to_scheme[c] for c in could_mean}
    return landing.pop() if len(landing) == 1 else IGNORE


def derive_all(cfg, merges=None):
    """{source: {source class: scheme class or IGNORE}} for the scheme given by merges
    (default: cfg["chosen_merges"])."""
    merges = cfg["chosen_merges"] if merges is None else merges
    _, to_scheme = build_scheme(cfg["base_classes"], merges)
    return {
        name: {c: derive_mapping(could, to_scheme) for c, could in src["classes"].items()}
        for name, src in cfg["sources"].items()
    }


# ---------- screening and the quiz ----------


def screen_pairs(audit, min_patches):
    """Pairs that go to the quiz: both classes have >= min_patches labelled fine-tune-area patches,
    and in
    at least one 8.1 matrix each direction of the pair happens at least once.
    Returns [(class A, class B, which matrix, A->B count, B->A count)], A before B
    alphabetically."""
    classes = list(CLASSES)  # the audit's matrices use this class order
    counts = {
        c: sum(audit["class_counts_finetune_areas"][a][c] for a in audit["finetune_areas"])
        for c in classes
    }
    pairs = []
    for i, a in enumerate(classes):
        for j in range(i + 1, len(classes)):
            b = classes[j]
            if counts[a] < min_patches or counts[b] < min_patches:
                continue
            for kind, matrix in audit["matrix"].items():
                a_to_b, b_to_a = matrix[i][j], matrix[j][i]
                if a_to_b > 0 and b_to_a > 0:
                    pairs.append((a, b, kind, a_to_b, b_to_a))
                    break
    return pairs


def sample_pair(labels, a, b, per_class, seed):
    """per_class random patches of class a and of class b, shuffled together.
    Returns a DataFrame with columns file, true_class, in shuffled order (the quiz order)."""
    rng = np.random.default_rng(seed)
    picked = []
    for c in (a, b):
        files = sorted(labels[labels["final_label"] == c]["file"])
        if len(files) < per_class:
            raise ValueError(f"only {len(files)} patches of {c}, need {per_class}")
        chosen = rng.choice(len(files), size=per_class, replace=False)
        picked += [(files[i], c) for i in sorted(chosen)]
    order = rng.permutation(len(picked))
    return pd.DataFrame([picked[i] for i in order], columns=["file", "true_class"])


def make_sheet(files, patches_dir, scale, columns=4):
    """One numbered contact sheet: the patches enlarged with sharp pixels, numbered from 1.
    Nothing on the sheet says what class, area or file a patch is."""
    size = 64 * scale
    rows = -(-len(files) // columns)
    strip = 18
    sheet = Image.new("RGB", (columns * (size + 6), rows * (size + strip + 6)), "white")
    draw = ImageDraw.Draw(sheet)
    for n, f in enumerate(files):
        im = Image.open(Path(patches_dir) / f).convert("RGB").resize((size, size), Image.NEAREST)
        x, y = (n % columns) * (size + 6), (n // columns) * (size + strip + 6)
        draw.text((x + 3, y + 3), str(n + 1), fill="black")
        sheet.paste(im, (x, y + strip))
    return sheet


def pair_name(a, b):
    return f"{a}_vs_{b}"


def fine_tune_labels(rule):
    """The user's final labels in the fine-tune areas only (TEST areas are never loaded here)."""
    eval_cfg = yaml.safe_load(Path(rule["eval_config"]).read_text(encoding="utf-8"))
    df = load_labels(eval_cfg["reviewed_csv"])
    finetune, _ = split_by_area(df, eval_cfg["test_areas"], eval_cfg["finetune_areas"])
    return finetune


def make_quiz(cfg):
    """Screen the pairs, then write one numbered sheet per pair and the key (kept apart)."""
    rule = cfg["rule"]
    audit = json.loads(Path(rule["audit_json"]).read_text(encoding="utf-8"))
    pairs = screen_pairs(audit, rule["min_patches_per_class"])
    labels = fine_tune_labels(rule)
    Path(rule["sheet_dir"]).mkdir(parents=True, exist_ok=True)
    key_rows = []
    for a, b, kind, a_to_b, b_to_a in pairs:
        sample = sample_pair(labels, a, b, rule["sample_per_class"], rule["sample_seed"])
        sheet = make_sheet(sample["file"], rule["patches_dir"], rule["picture_scale"])
        sheet.save(Path(rule["sheet_dir"]) / f"quiz_{pair_name(a, b)}.png")
        for n, row in enumerate(sample.itertuples(), start=1):
            key_rows.append(
                {
                    "pair": pair_name(a, b),
                    "number": n,
                    "file": row.file,
                    "true_letter": "A" if row.true_class == a else "B",
                    "true_class": row.true_class,
                }
            )
        print(
            f"{pair_name(a, b)}: screened in via the {kind} matrix ({a}->{b} {a_to_b}, {b}->{a} "
            f"{b_to_a})"
        )
    pd.DataFrame(key_rows).to_csv(rule["key_path"], index=False)
    print(
        f"Sheets in {rule['sheet_dir']}, key in {rule['key_path']} (do not open the key before "
        f"judging)"
    )
    return pairs


# ---------- scoring and the decision ----------


def decide(accuracy, rule):
    """'merge', 'keep separate (clear)' or 'keep separate (unclear)' from the judge's accuracy."""
    if accuracy <= rule["merge_if_accuracy_at_most"]:
        return "merge"
    if accuracy >= rule["keep_separate_if_accuracy_at_least"]:
        return "keep separate (clear)"
    return "keep separate (unclear)"


def score_quiz(answers, key):
    """Per pair: number right, number judged, accuracy. answers: pair, number, answer (A/B)."""
    merged = key.merge(answers, on=["pair", "number"], how="left")
    if merged["answer"].isna().any():
        raise ValueError("some quiz items have no answer")
    merged["right"] = merged["answer"].str.upper() == merged["true_letter"]
    out = {}
    for pair, group in merged.groupby("pair"):
        out[pair] = {
            "right": int(group["right"].sum()),
            "n": int(len(group)),
            "accuracy": float(group["right"].mean()),
        }
    return out


def merges_from_decisions(decisions):
    """Turn 'merge' decisions into a merges dict. Pair 'A_vs_B' -> {'A+B': [A, B]}.
    Overlapping merges (a class in two merged pairs) are joined into one group."""
    groups = []
    for pair, decision in decisions.items():
        if decision != "merge":
            continue
        a, b = pair.split("_vs_")
        hit = [g for g in groups if a in g or b in g]
        merged = set([a, b]).union(*hit)
        groups = [g for g in groups if g not in hit] + [merged]
    return {"+".join(sorted(g)): sorted(g) for g in groups}


def render_report(cfg, pairs, results, decisions, merges, judge_note):
    rule = cfg["rule"]
    lines = ["# Step 8.2: class scheme for Indian land", ""]
    lines.append(
        "Decision rule (written and committed before the quiz, see "
        "`configs/classes_india.yaml`): merge two "
        "classes only if they are confused in both directions in the 8.1 audit AND a blind judge "
        "cannot "
        f"tell them apart on a random sample (right {rule['merge_if_accuracy_at_most']:.0%} or "
        f"less). "
        f"Right {rule['keep_separate_if_accuracy_at_least']:.0%} or more keeps them separate; "
        f"anything in "
        "between also keeps them separate. Accuracy of the model is never a reason to merge.\n"
    )
    lines.append(f"**Who judged:** {judge_note}\n")
    lines.append("## 1. Screen (from `results/error_audit.json`, fine-tune areas only)\n")
    lines.append(
        f"Both classes need at least {rule['min_patches_per_class']} labelled fine-tune-area "
        f"patches, and the "
        "pair must be confused in both directions in one of the two 8.1 matrices.\n"
    )
    rows = [f"| {a} / {b} | {kind} | {ab} | {ba} |" for a, b, kind, ab, ba in pairs]
    lines += ["| pair | matrix | A -> B | B -> A |", "|---|---|---|---|"] + rows + [""]
    lines.append(
        "Not tested (too few labelled patches, so the rule cannot merge them): Pasture 0, "
        "SeaLake 0, "
        "PermanentCrop 2, Forest 1, HerbaceousVegetation 1. So the rule says nothing about River "
        "versus "
        "SeaLake (SeaLake has no Indian label) or AnnualCrop versus PermanentCrop.\n"
    )
    lines.append("## 2. The blind quiz\n")
    lines.append(
        f"{rule['sample_per_class']} random patches per class of each pair (seed "
        f"{rule['sample_seed']}, "
        "fine-tune areas only), shuffled, no labels shown. Numbered sheets: "
        f"`{rule['sheet_dir']}/quiz_<pair>.png`; the key (which number is which patch) is "
        f"`{rule['key_path']}`; the answers are `{rule['answers_path']}`.\n"
    )
    lines += ["| pair | right | judged | accuracy | decision |", "|---|---|---|---|---|"]
    for pair, r in results.items():
        lines.append(
            f"| {pair} | {r['right']} | {r['n']} | {r['accuracy']:.2f} | {decisions[pair]} |"
        )
    lines.append("")
    lines.append("## 3. Chosen scheme\n")
    if merges:
        lines.append(
            "Merges: " + "; ".join(f"{k} = {' + '.join(v)}" for k, v in merges.items()) + ".\n"
        )
    else:
        lines.append("**Keep the 10 EuroSAT classes** (`chosen_merges: {}`).\n")
    summary = json.loads(Path(cfg["rule"]["india_after_json"]).read_text(encoding="utf-8"))
    summary = summary["summary_mean_std_over_seeds"]
    before = summary["india_test_accuracy_before"]
    after = summary["india_test_accuracy_after"]
    lines.append(
        f"The 10-class numbers (3 seeds, Indian TEST areas, accuracy {before['mean']:.4f} ± "
        f"{before['std']:.4f} before, {after['mean']:.4f} ± {after['std']:.4f} after fine-tuning, "
        "`results/india_after.json`) stay as they are. Accuracy on a merged class set would not be "
        "comparable to them, and any write-up that shows both must say so.\n"
    )
    lines.append("## 4. Mapping of every label source onto the chosen scheme\n")
    lines.append(
        "Each source class maps to exactly one scheme class or `ignore` (not used as a label). "
        "`could mean` = the EuroSAT classes it can stand for; it maps to a scheme class only if "
        "all of them "
        "land in the same one.\n"
    )
    derived = derive_all(cfg, merges)
    for name, src in cfg["sources"].items():
        lines.append(f"### {name}: tier {src['tier']}\n")
        if "source" in src:
            lines.append(f"Source: {src['source']}\n")
        lines.append(str(src["note"]).strip() + "\n")
        lines += ["| source class | could mean | maps to |", "|---|---|---|"]
        for c, could in src["classes"].items():
            lines.append(f"| {c} | {', '.join(could) or '(none)'} | {derived[name][c]} |")
        lines.append("")
    lines.append("## 5. What this means for the next steps\n")
    lines.append(
        "- Tier-2 maps (WorldCover, Dynamic World) cannot give a single EuroSAT class for "
        "Cropland/crops, "
        "Built-up/built, Water, or Grassland/Shrubland under the 10-class scheme, so those "
        "labels map to "
        "`ignore`. Step 8.4 must decide how to use them (for example with a coarser training "
        "label that is "
        "kept apart from the 10-class evaluation); this step does not.\n"
        "- Hand labels (tier 1) stay in the 10 classes, so every earlier number remains valid.\n"
    )
    return "\n".join(lines) + "\n"


def score(cfg, answers_path=None, judge_note=None):
    rule = cfg["rule"]
    audit = json.loads(Path(rule["audit_json"]).read_text(encoding="utf-8"))
    pairs = screen_pairs(audit, rule["min_patches_per_class"])
    key = pd.read_csv(rule["key_path"])
    answers = pd.read_csv(answers_path or rule["answers_path"])
    results = score_quiz(answers, key)
    decisions = {pair: decide(r["accuracy"], rule) for pair, r in results.items()}
    merges = merges_from_decisions(decisions)
    note = judge_note or (
        'Claude, blind (user\'s decision 2026-11-08, "just do everything"). Claude saw only the '
        "numbered "
        "sheets, never the key, when answering. The user has not judged this sample; their eyes "
        "may differ "
        "from Claude's, so the sheets are kept and the user can re-judge them (`--answers`)."
    )
    report = render_report(cfg, pairs, results, decisions, merges, note)
    Path(cfg["output_path"]).write_text(report, encoding="utf-8")
    print(json.dumps({"results": results, "decisions": decisions, "merges": merges}, indent=1))
    print(f"Saved {cfg['output_path']}")
    return merges


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["make-quiz", "score"])
    parser.add_argument("--config", required=True)
    parser.add_argument("--answers", help="a different answers CSV (e.g. the user's own)")
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    if args.stage == "make-quiz":
        make_quiz(cfg)
    else:
        note = "the user (own answers file)" if args.answers else None
        score(cfg, args.answers, note)


if __name__ == "__main__":
    main()
