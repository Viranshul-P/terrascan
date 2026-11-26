"""Step 8.6: test-time augmentation (d) and a seed ensemble (e), scored by Indian LOAO accuracy.

Inference only, on the 8.1 audit's leave-one-area-out models. Rule: configs/india_ablation.yaml.
    python -m src.india_ablation --config configs/india_ablation.yaml
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml

from src.data import CLASSES, build_transforms, read_image
from src.error_audit import loao_folds
from src.evaluate import load_run
from src.india_eval import load_labels, split_by_area
from src.india_finetune import mean_std


def dihedral(x):
    """The 8 flips / 90-degree turns of a batch (N, C, H, W)."""
    turns = [torch.rot90(x, k, dims=(2, 3)) for k in range(4)]
    return turns + [t.flip(3) for t in turns]


@torch.no_grad()
def probs(model, cfg, df, patches_dir, device, tta):
    """Softmax (N, classes) for every patch; averaged over the 8 views if tta."""
    stats = cfg.get("norm_stats") or json.loads(
        Path(cfg["data"]["stats_path"]).read_text(encoding="utf-8"))
    transform = build_transforms(stats, False, cfg.get("image_size", 64), cfg.get("target_stats"))
    x = torch.stack([transform(read_image(Path(patches_dir) / f)) for f in df["file"]]).to(device)
    model.to(device).eval()
    views = dihedral(x) if tta else [x]
    return torch.stack([torch.softmax(model(v).float(), 1) for v in views]).mean(0).cpu().numpy()


def acc(p, df):
    return float((p.argmax(1) == np.array([CLASSES.index(c) for c in df["final_label"]])).mean())


def kept(ref, new):
    return new["mean"] - ref["mean"] > ref["std"] + new["std"]


def main(argv=None):
    a = argparse.ArgumentParser()
    a.add_argument("--config", required=True)
    cfg = yaml.safe_load(Path(a.parse_args(argv).config).read_text(encoding="utf-8"))
    audit = yaml.safe_load(Path(cfg["error_audit_config"]).read_text(encoding="utf-8"))
    ft = yaml.safe_load(Path(cfg["india_finetune_config"]).read_text(encoding="utf-8"))
    ev = yaml.safe_load(Path(ft["india_eval_config"]).read_text(encoding="utf-8"))
    df, _ = split_by_area(load_labels(ev["reviewed_csv"]), ev["test_areas"], ev["finetune_areas"])
    assert not set(df["area"]) & set(ev["test_areas"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    plain, tta = {}, {}
    folds = loao_folds(df)
    rows = pd.concat([h for _, _, h in folds], ignore_index=True)
    store = {"plain": [], "tta": []}  # per seed: pooled softmax in fold order
    for seed in cfg["seeds"]:
        pp, pt = [], []
        for area, _, held in folds:
            run = Path("models") / f"{audit['loao_run_prefix']}_{area}" / f"seed{seed}"
            m, mcfg = load_run(run)
            pp.append(probs(m, mcfg, held, ev["patches_dir"], device, False))
            pt.append(probs(m, mcfg, held, ev["patches_dir"], device, True))
        store["plain"].append(np.concatenate(pp))
        store["tta"].append(np.concatenate(pt))
        plain[seed], tta[seed] = acc(store["plain"][-1], rows), acc(store["tta"][-1], rows)
        print(f"seed {seed}: plain {plain[seed]:.4f}  tta {tta[seed]:.4f}")
    ref, d = mean_std(list(plain.values())), mean_std(list(tta.values()))
    keep_d = kept(ref, d)
    ens = acc(np.mean(store["tta" if keep_d else "plain"], axis=0), rows)
    keep_e = ens - ref["mean"] > 2 * ref["std"]
    out = {
        "config": "configs/india_ablation.yaml", "n_patches": len(rows),
        "reference_loao": {"per_seed": plain, **ref},
        "attempts": [
            {"id": "d", "what": "test-time augmentation (8 flips/turns, mean softmax)",
             "per_seed": tta, **d, "kept": keep_d},
            {"id": "e", "what": "seed ensemble (mean softmax of 3 seeds"
                                + (", with d)" if keep_d else ")"),
             "accuracy": ens, "kept": bool(keep_e)},
            {"id": "a", "what": "bigger context window per patch", "status": "not run",
             "reason": "needs patches cut with a wider window from the original scenes; not built"},
            {"id": "b", "what": "dry season + monsoon input", "status": "not run",
             "reason": "needs monsoon composites (8.7 data); 4.6 found 0 clear Jul-Aug scenes"},
            {"id": "c", "what": "pseudo-labels (tier 3)", "status": "not run",
             "reason": "needs a training run; left for after 8.3b/8.4 (one GPU)"},
        ],
    }
    Path(cfg["output_json"]).write_text(json.dumps(out, indent=1), encoding="utf-8")
    Path(cfg["output_md"]).write_text(report(out), encoding="utf-8")
    print(json.dumps({"reference": ref, "d": d, "keep_d": keep_d, "e": ens, "keep_e": keep_e}))


def report(out):
    r = out["reference_loao"]
    lines = ["# Other ways to improve Indian accuracy (step 8.6)", "",
             f"Metric: Indian leave-one-area-out accuracy on {out['n_patches']} fine-tune patches, "
             "seeds 42/43/44. Rule: configs/india_ablation.yaml (kept only if better than the "
             "reference by more than the stds added together). Test areas never used.", "",
             "| Attempt | Result | Kept |", "|---|---|---|",
             f"| reference (8.1 LOAO models) | {r['mean']:.4f} ± {r['std']:.4f} | - |"]
    for a in out["attempts"]:
        if "mean" in a:
            res = f"{a['mean']:.4f} ± {a['std']:.4f}"
        elif "accuracy" in a:
            res = f"{a['accuracy']:.4f} (one number)"
        else:
            res = f"not run: {a['reason']}"
        lines.append(f"| {a['id']}: {a['what']} | {res} | {'yes' if a.get('kept') else 'no'} |")
    lines += ["", "Made by `src/india_ablation.py`; numbers in `results/india_ablation.json`."]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
