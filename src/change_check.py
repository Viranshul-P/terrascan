"""Step 4.8: how often is a reported change real?

The two maps from step 4.7 each have errors, so "change" also shows up where nothing changed.
This takes a random sample of patches the model says changed class (map seed), and shows each
one as a before/after pair. The pair images never show the model's classes, so the judge only
answers: did the land really change between the two years? (yes / no / unclear)

Commands (run from the repo root):
  python -m src.change_check --config configs/change.yaml sample     # pick patches, cut pairs
  python -m src.change_check --config configs/change.yaml review     # Gradio: you check Claude
  python -m src.change_check --config configs/change.yaml summarise  # rate -> check_output

Claude's answers live in check_claude_csv (columns pair, answer). The user's review goes to
check_reviewed_csv (pair, claude, final, changed).
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from PIL import Image, ImageDraw

ANSWERS = ["yes", "no", "unclear"]
REVIEW_COLUMNS = ["pair", "claude", "final", "changed"]


def sample_changed(patches, before_col, after_col, n, seed):
    """n random patches whose class differs between before_col and after_col.

    Returns pair id, row, col, lon, lat only: no classes, so the judge stays blind.
    """
    changed = patches[patches[before_col] != patches[after_col]]
    picked = changed.sample(n=n, random_state=seed).reset_index(drop=True)
    picked.insert(0, "pair", [f"pair_{i:02d}" for i in range(len(picked))])
    return picked[["pair", "row", "col", "lon", "lat"]]


def crop_with_outline(rgb, row, col, size, context, scale):
    """The patch plus `context` pixels around it (cut short at the image edge), enlarged
    `scale` times with nearest-pixel resizing, with the patch itself outlined in yellow."""
    top, left = max(row - context, 0), max(col - context, 0)
    bottom = min(row + size + context, rgb.shape[0])
    right = min(col + size + context, rgb.shape[1])
    crop = Image.fromarray(rgb[top:bottom, left:right])
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST)
    y0, x0 = (row - top) * scale, (col - left) * scale
    ImageDraw.Draw(crop).rectangle(
        [x0 - 1, y0 - 1, x0 + size * scale, y0 + size * scale], outline=(255, 255, 0), width=2
    )
    return crop


def side_by_side(left, right, gap=16):
    """Two images next to each other on a white background."""
    out = Image.new("RGB", (left.width + gap + right.width, max(left.height, right.height)),
                    (255, 255, 255))
    out.paste(left, (0, 0))
    out.paste(right, (left.width + gap, 0))
    return out


def read_reviewed(path):
    """Review rows saved so far (empty table if the file doesn't exist yet)."""
    if Path(path).exists():
        return pd.read_csv(path)
    return pd.DataFrame(columns=REVIEW_COLUMNS)


def save_review(path, pair, claude, final):
    """Append one review row. Does nothing if this pair is already reviewed."""
    if final not in ANSWERS:
        raise ValueError(f"Unknown answer: {final}")
    reviewed = read_reviewed(path)
    if pair in set(reviewed["pair"]):
        return
    row = pd.DataFrame([{"pair": pair, "claude": claude, "final": final,
                         "changed": final != claude}])
    row.to_csv(path, mode="a", header=not Path(path).exists(), index=False)


def wilson_interval(k, n, z=1.96):
    """95% range for a rate k/n (Wilson score interval; works for small n and k=0 or k=n)."""
    if n == 0:
        return None
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(centre - half, 4), round(centre + half, 4)]


def real_change_rate(answers):
    """Counts of yes/no/unclear, and the share of yes among the clear answers (yes + no)."""
    counts = {a: int((answers == a).sum()) for a in ANSWERS}
    clear = counts["yes"] + counts["no"]
    rate = round(counts["yes"] / clear, 4) if clear else None
    return {"counts": counts, "real_rate": rate,
            "real_rate_95": wilson_interval(counts["yes"], clear)}


def make_sample(cfg):
    patches = pd.read_csv(cfg["patches_csv"])
    years, seed = list(cfg["years"]), cfg["map_seed"]
    sample = sample_changed(patches, f"pred_{years[0]}_seed{seed}", f"pred_{years[1]}_seed{seed}",
                            cfg["check_n"], cfg["check_seed"])
    rgbs = [np.array(Image.open(Path(cfg["cache_dir"]) / f"rgb_{y}.png")) for y in years]
    out_dir = Path(cfg["check_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in sample.itertuples():
        crops = [crop_with_outline(rgb, p.row, p.col, cfg["patch_size"], cfg["check_context"],
                                   cfg["check_scale"]) for rgb in rgbs]
        side_by_side(*crops).save(out_dir / f"{p.pair}.png")
    sample.to_csv(cfg["check_sample_csv"], index=False)
    print(f"{len(sample)} pairs ({years[0]} left, {years[1]} right) -> {out_dir}")


def build_review_app(cfg):
    """Shows each pair with Claude's answer; the user agrees or picks the right answer."""
    import gradio as gr

    claude = pd.read_csv(cfg["check_claude_csv"]).set_index("pair")["answer"]
    order = claude.index.tolist()
    path, years = cfg["check_reviewed_csv"], list(cfg["years"])

    def show_next():
        reviewed = read_reviewed(path)
        done = set(reviewed["pair"])
        n_changed = int(reviewed["changed"].astype(bool).sum())
        progress = f"**{len(done)} of {len(order)} reviewed**, {n_changed} changed by you."
        todo = [p for p in order if p not in done]
        if not todo:
            return None, None, "", progress + "  \n**All done.**"
        pair = todo[0]
        image = Image.open(Path(cfg["check_dir"]) / f"{pair}.png")
        return image, pair, f"## Claude's answer: {claude[pair]}", progress

    def on_click(final, pair):
        if pair is not None:
            save_review(path, pair, claude[pair], claude[pair] if final == "agree" else final)
        return show_next()

    with gr.Blocks(title="TerraScan change check") as app:
        gr.Markdown(f"Left: **{years[0]}**, right: **{years[1]}**, same place. The yellow box is "
                    "the patch (640 m). Did the land in the box **really change** (e.g. fields "
                    "became buildings, new roads, water appeared)? Different crop colours or "
                    "brightness alone is not a real change. Press **Agree** or the right answer.")
        current = gr.State(None)
        image = gr.Image(format="png", show_label=False, interactive=False)
        claude_text = gr.Markdown()
        progress = gr.Markdown()
        outputs = [image, current, claude_text, progress]
        gr.Button("Agree", variant="primary").click(
            lambda p: on_click("agree", p), current, outputs)
        with gr.Row():
            for answer in ANSWERS:
                gr.Button(answer).click(lambda p, a=answer: on_click(a, p), current, outputs)
        app.load(show_next, None, outputs)
    return app


def scale_up(seed_result, rate):
    """Rough real changed area: the map seed's reported change times the real rate (and its range).
    Only sampling error is in the range, not seed-to-seed spread or the unclear pairs."""
    out = {"reported_changed_patches": seed_result["changed_patches"],
           "reported_changed_km2": seed_result["changed_km2"]}
    if rate["real_rate"] is not None:
        out["estimated_real_changed_km2"] = round(seed_result["changed_km2"] * rate["real_rate"], 1)
        out["estimated_real_changed_km2_95"] = [
            round(seed_result["changed_km2"] * r, 1) for r in rate["real_rate_95"]
        ]
    return out


def check_same_pairs(reviewed, claude):
    """Stop unless the review covers exactly the pairs Claude answered (no stale/missing rows)."""
    if set(reviewed["pair"]) != set(claude["pair"]) or len(reviewed) != len(claude):
        raise ValueError("reviewed pairs don't match Claude's pairs: review every pair first")


def summarise(cfg):
    reviewed = read_reviewed(cfg["check_reviewed_csv"])
    claude = pd.read_csv(cfg["check_claude_csv"])
    check_same_pairs(reviewed, claude)
    result = {
        "n_pairs": len(reviewed),
        "map_seed": cfg["map_seed"],
        "sample_seed": cfg["check_seed"],
        "judged_by": "Claude first (blind to the model's classes), then reviewed by the user",
        "final": real_change_rate(reviewed["final"]),
        "claude_before_review": real_change_rate(claude["answer"]),
        "n_changed_by_user": int(reviewed["changed"].astype(bool).sum()),
    }
    change = json.loads(Path(cfg["output_path"]).read_text(encoding="utf-8"))
    result.update(scale_up(change["per_seed"][str(cfg["map_seed"])], result["final"]))
    Path(cfg["check_output"]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("command", choices=["sample", "review", "summarise"])
    args = parser.parse_args()
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    if args.command == "sample":
        make_sample(cfg)
    elif args.command == "review":
        build_review_app(cfg).launch(inbrowser=True)  # local only, no share link
    else:
        summarise(cfg)


if __name__ == "__main__":
    main()
