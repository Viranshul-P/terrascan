"""Step 4.2: a small Gradio app to hand-label the Indian patches.

Shows one patch at a time, enlarged, with a button per EuroSAT class plus Skip/unclear.
Every click is written to data/india/labels.csv straight away, so you can close it at any time;
next start it continues with the first patch that has no label yet.
It never shows a model prediction, so the labels stay independent of the model.

Review mode (--review): shows each patch with the label Claude gave it (labels.csv).
The user agrees or picks the correct label; results go to labels_reviewed.csv.
Resumes like the labeller.

Run from the repo root: python -m src.labeller --config configs/india.yaml [--review]
"""

import argparse
from pathlib import Path

import gradio as gr
import numpy as np
import pandas as pd
import yaml
from PIL import Image

from src.data import CLASSES

SKIP = "skip"  # saved as the label when a patch is unclear or fits no class
LABEL_COLUMNS = ["file", "label", "area", "lat", "lon", "labelled_by"]
REVIEW_COLUMNS = ["file", "claude_label", "final_label", "changed", "area", "lat", "lon"]


def shuffled_order(patches, seed):
    """All patch file names in a fixed random order: areas are mixed, resuming is repeatable."""
    return patches["file"].sample(frac=1, random_state=seed).tolist()


def read_labels(labels_csv, columns=LABEL_COLUMNS):
    """Rows saved so far (empty table with these columns if the file doesn't exist yet)."""
    if Path(labels_csv).exists():
        return pd.read_csv(labels_csv)
    return pd.DataFrame(columns=columns)


def next_file(order, done):
    """First file in order that isn't in done, or None when everything is labelled."""
    for file in order:
        if file not in done:
            return file
    return None


def save_label(labels_csv, patch, label, labelled_by="user"):
    """Append one row to labels_csv. Does nothing if this file already has a label.

    labelled_by records who chose the label: "user" (clicked in this app) or "claude".
    """
    if label != SKIP and label not in CLASSES:
        raise ValueError(f"Unknown label: {label}")
    if patch["file"] in set(read_labels(labels_csv)["file"]):
        return
    row = pd.DataFrame([{"file": patch["file"], "label": label, "area": patch["area"],
                         "lat": patch["lat"], "lon": patch["lon"],
                         "labelled_by": labelled_by}])
    Path(labels_csv).parent.mkdir(parents=True, exist_ok=True)
    row.to_csv(labels_csv, mode="a", header=not Path(labels_csv).exists(), index=False)


def save_review(reviewed_csv, labelled, final_label):
    """Append one reviewed row: Claude's label, the user's final label, and whether it changed.

    labelled is one row of labels.csv. Does nothing if this file was already reviewed.
    """
    if final_label != SKIP and final_label not in CLASSES:
        raise ValueError(f"Unknown label: {final_label}")
    if labelled["file"] in set(read_labels(reviewed_csv, REVIEW_COLUMNS)["file"]):
        return
    row = pd.DataFrame([{"file": labelled["file"], "claude_label": labelled["label"],
                         "final_label": final_label, "changed": final_label != labelled["label"],
                         "area": labelled["area"], "lat": labelled["lat"], "lon": labelled["lon"]}])
    Path(reviewed_csv).parent.mkdir(parents=True, exist_ok=True)
    row.to_csv(reviewed_csv, mode="a", header=not Path(reviewed_csv).exists(), index=False)


def progress_text(labels, total):
    """One-line summary: how many done, skipped, and per class."""
    counts = labels["label"].value_counts()
    per_class = ", ".join(f"{name} {counts.get(name, 0)}" for name in CLASSES)
    n_labelled = len(labels) - counts.get(SKIP, 0)
    return (f"**{n_labelled} labelled**, {counts.get(SKIP, 0)} skipped, "
            f"{total - len(labels)} not seen yet.  \n{per_class}")


def load_patch(cfg, file):
    """The patch as an enlarged RGB array, with sharp pixels (no smoothing)."""
    size = cfg["display_size"]
    image = Image.open(Path(cfg["patches_dir"]) / file).convert("RGB")
    return np.array(image.resize((size, size), Image.Resampling.NEAREST))


def build_app(cfg):
    patches = pd.read_csv(cfg["patches_csv"]).set_index("file", drop=False)
    order = shuffled_order(patches, cfg["seed"])
    labels_csv = cfg["labels_csv"]
    size = cfg["display_size"]

    def show_next():
        """Image, file name and progress text for the next unlabelled patch."""
        labels = read_labels(labels_csv)
        file = next_file(order, set(labels["file"]))
        progress = progress_text(labels, len(patches))
        if file is None:
            return None, None, progress + "  \n**All patches done.**"
        return load_patch(cfg, file), file, progress

    def on_click(label, file):
        if file is not None:
            save_label(labels_csv, patches.loc[file], label)
        return show_next()

    with gr.Blocks(title="TerraScan labeller") as app:
        gr.Markdown("Pick the EuroSAT class that covers **most** of the patch. "
                    "If it's unclear or fits no class, press **Skip / unclear**. "
                    "Each click is saved.")
        current = gr.State(None)
        image = gr.Image(height=size, width=size, format="png",  # png: exact pixels
                         show_label=False, interactive=False)
        progress = gr.Markdown()
        with gr.Row():
            for name in CLASSES:
                button = gr.Button(name)
                button.click(lambda f, name=name: on_click(name, f), current,
                             [image, current, progress])
        skip = gr.Button("Skip / unclear", variant="secondary")
        skip.click(lambda f: on_click(SKIP, f), current, [image, current, progress])
        app.load(show_next, None, [image, current, progress])
    return app


def build_review_app(cfg):
    """Shows each patch with Claude's label; the user agrees or picks the correct one."""
    labelled = read_labels(cfg["labels_csv"]).set_index("file", drop=False)
    order = labelled["file"].tolist()  # same order Claude labelled them in
    reviewed_csv = cfg["reviewed_csv"]
    size = cfg["display_size"]

    def show_next():
        """Image, file name, Claude's label and progress text for the next unreviewed patch."""
        reviewed = read_labels(reviewed_csv, REVIEW_COLUMNS)
        file = next_file(order, set(reviewed["file"]))
        n_changed = int(reviewed["changed"].astype(bool).sum())
        progress = (f"**{len(reviewed)} of {len(order)} reviewed**, "
                    f"{n_changed} changed by you.")
        if file is None:
            return None, None, "", progress + "  \n**All done.**"
        claude_label = labelled.loc[file, "label"]
        shown = "Skip / unclear" if claude_label == SKIP else claude_label
        return load_patch(cfg, file), file, f"## Claude's label: {shown}", progress

    def on_click(final_label, file):
        if file is not None:
            agreed = labelled.loc[file, "label"] if final_label == "agree" else final_label
            save_review(reviewed_csv, labelled.loc[file], agreed)
        return show_next()

    with gr.Blocks(title="TerraScan label review") as app:
        gr.Markdown("Does Claude's label fit (the class that covers **most** of the patch)? "
                    "Press **Agree**, or press the correct class / **Skip / unclear**. "
                    "Each click is saved.")
        current = gr.State(None)
        image = gr.Image(height=size, width=size, format="png",  # png: exact pixels
                         show_label=False, interactive=False)
        claude_text = gr.Markdown()
        progress = gr.Markdown()
        outputs = [image, current, claude_text, progress]
        agree = gr.Button("Agree", variant="primary")
        agree.click(lambda f: on_click("agree", f), current, outputs)
        with gr.Row():
            for name in CLASSES:
                button = gr.Button(name)
                button.click(lambda f, name=name: on_click(name, f), current, outputs)
        skip = gr.Button("Skip / unclear", variant="secondary")
        skip.click(lambda f: on_click(SKIP, f), current, outputs)
        app.load(show_next, None, outputs)
    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--review", action="store_true", help="review Claude's labels")
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    app = build_review_app(cfg) if args.review else build_app(cfg)
    app.launch(inbrowser=True)  # local only, no share link


if __name__ == "__main__":
    main()
