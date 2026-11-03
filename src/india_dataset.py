"""Build the Indian patch dataset folder for Hugging Face (step 4.5).

Run from the repo root:
    python -m src.india_dataset --config configs/india_dataset.yaml

Output folder (Hugging Face "imagefolder" layout, no extra library needed):
    <out_dir>/README.md            dataset card: src/india_dataset_card.md with the counts filled in
    <out_dir>/train/*.png          patches from the fine-tune areas
    <out_dir>/train/metadata.csv   file_name, label, split, area, lat, lon, ...
    <out_dir>/test/*.png           patches from the test areas
    <out_dir>/test/metadata.csv
"""

import argparse
import json
import shutil
from pathlib import Path

import pandas as pd
import yaml

from src.data import CLASSES

COLUMNS = [
    "file_name", "label", "split", "area", "lat", "lon", "scene_id", "date", "first_labelled_by",
]


def build_table(reviewed, patches, test_areas, finetune_areas):
    """One row per labelled patch. Skips are dropped; label = final_label (the user's decision)."""
    # The card says the user agreed with every label Claude gave. Stop if that is no longer true
    # (a Claude label changed to another class or to skip), so the card can't quietly become false.
    overridden = (reviewed["claude_label"] != "skip") & (
        reviewed["claude_label"] != reviewed["final_label"]
    )
    if overridden.any():
        raise ValueError(
            f"{int(overridden.sum())} Claude labels were changed by the user: "
            "update the 'How it was labelled' text in the card first"
        )
    labelled = reviewed[reviewed["final_label"] != "skip"].copy()
    unknown = set(labelled["final_label"]) - set(CLASSES)
    if unknown:
        raise ValueError(f"labels that are not EuroSAT classes: {sorted(unknown)}")
    known_areas = set(test_areas) | set(finetune_areas)
    if set(labelled["area"]) - known_areas:
        raise ValueError(f"areas in neither split: {sorted(set(labelled['area']) - known_areas)}")

    scenes = patches[["file", "scene_id", "date"]]
    table = labelled.merge(scenes, on="file", how="left")
    if table["scene_id"].isna().any():
        raise ValueError("some labelled patches are missing from patches.csv")

    table["split"] = ["test" if a in test_areas else "train" for a in table["area"]]
    # changed == False: the user agreed with Claude's label. changed == True: Claude had skipped it
    # and the user gave the label. Either way the final label is the user's.
    table["first_labelled_by"] = ["user" if c else "claude" for c in table["changed"]]
    table = table.rename(columns={"file": "file_name", "final_label": "label"})
    return table[COLUMNS].sort_values(["split", "area", "file_name"]).reset_index(drop=True)


def count_table(table):
    """Counts for the card and results/. Classes with 0 patches are listed too."""

    def per_class(rows):
        return {c: int((rows["label"] == c).sum()) for c in CLASSES}

    return {
        "patches": len(table),
        "per_split": {s: int((table["split"] == s).sum()) for s in ["train", "test"]},
        "per_class": per_class(table),
        "per_class_train": per_class(table[table["split"] == "train"]),
        "per_class_test": per_class(table[table["split"] == "test"]),
        "per_area": {a: int(n) for a, n in table["area"].value_counts().sort_index().items()},
        "first_labelled_by": {
            k: int(n) for k, n in table["first_labelled_by"].value_counts().items()
        },
    }


def make_card(counts, table, areas, license_id, template):
    """Dataset card text (README.md): fill the template with numbers from `counts` and `table`."""
    years = ", ".join(sorted({d[:4] for d in table["date"]}))

    class_rows = []
    for c in CLASSES:
        n_train = counts["per_class_train"][c]
        n_test = counts["per_class_test"][c]
        class_rows.append(f"| {c} | {n_train} | {n_test} | {counts['per_class'][c]} |")

    area_rows = []
    for area in areas:
        rows = table[table["area"] == area["name"]]
        if len(rows) == 0:
            continue
        split, scene, date = rows["split"].iloc[0], rows["scene_id"].iloc[0], rows["date"].iloc[0]
        bbox = ", ".join(str(x) for x in area["bbox"])
        n = len(rows)
        area_rows.append(f"| {area['name']} | {split} | [{bbox}] | {date} | `{scene}` | {n} |")

    by = counts["first_labelled_by"]
    return template.format(
        license_id=license_id,
        license_upper=license_id.upper(),
        patches=counts["patches"],
        n_train=counts["per_split"]["train"],
        n_test=counts["per_split"]["test"],
        n_claude=by.get("claude", 0),
        n_user=by.get("user", 0),
        years=years,
        class_rows="\n".join(class_rows),
        area_rows="\n".join(area_rows),
    )


def write_dataset(table, card, patches_dir, out_dir):
    """Copy the PNGs into train/ and test/, write metadata.csv per split and README.md."""
    out_dir = Path(out_dir)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    for split, rows in table.groupby("split"):
        split_dir = out_dir / split
        split_dir.mkdir(parents=True)
        for name in rows["file_name"]:
            shutil.copy2(Path(patches_dir) / name, split_dir / name)
        rows.to_csv(split_dir / "metadata.csv", index=False)
    (out_dir / "README.md").write_text(card, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    areas = yaml.safe_load(Path(cfg["areas_config"]).read_text(encoding="utf-8"))["areas"]
    # The area split is read from step 4.3's config, so there is only one copy of it.
    split = yaml.safe_load(Path(cfg["split_config"]).read_text(encoding="utf-8"))

    table = build_table(
        pd.read_csv(cfg["reviewed_csv"]),
        pd.read_csv(cfg["patches_csv"]),
        split["test_areas"],
        split["finetune_areas"],
    )
    counts = count_table(table)
    template = Path(cfg["card_template"]).read_text(encoding="utf-8")
    card = make_card(counts, table, areas, cfg["license"], template)
    write_dataset(table, card, cfg["patches_dir"], cfg["out_dir"])
    Path(cfg["counts_path"]).write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(counts, indent=2))
    print(f"Dataset folder: {cfg['out_dir']}")


if __name__ == "__main__":
    main()
