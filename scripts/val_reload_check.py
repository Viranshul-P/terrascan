"""Check that src/evaluate.py's load_run rebuilds saved models correctly, using the VAL split only.

For one seed of each model: reload it with its own config.yaml, predict on val, and compare the
accuracy with best_val_acc saved in its metrics.json during training. They should match.
Run this before the test-split evaluation (step 2.5).

Run from the repo root:
    python scripts/val_reload_check.py
Saves results/val_reload_check.txt
"""

import json
import sys
from pathlib import Path

import torch
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.data import build_dataloaders  # noqa: E402
from src.evaluate import load_run, predict  # noqa: E402

EVAL_CONFIG = Path("configs/evaluate.yaml")
OUT = Path("results/val_reload_check.txt")


def main():
    cfg = yaml.safe_load(EVAL_CONFIG.read_text(encoding="utf-8"))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    seed = cfg["confusion_seed"]  # one seed per model is enough for this check
    lines = [f"VAL accuracy: reloaded vs saved in metrics.json (seed {seed}, float32)"]
    for entry in cfg["models"]:
        run_dir = Path(entry["run_dir"]) / f"seed{seed}"
        model, run_cfg = load_run(run_dir)
        _, val_loader, _ = build_dataloaders(
            run_cfg["data"],
            run_cfg.get("image_size", 64),
            run_cfg.get("norm_stats"),
            run_cfg.get("target_stats"),
        )
        preds, labels = predict(model, val_loader, device)
        reloaded = (preds == labels).sum().item() / len(labels)
        saved = json.loads((run_dir / "metrics.json").read_text())["best_val_acc"]
        match = "match" if abs(reloaded - saved) < 1e-9 else "DIFFERENT"
        lines.append(f"{entry['name']}: reloaded {reloaded:.4f} | saved {saved:.4f} | {match}")
    text = "\n".join(lines) + "\n"
    print(text)
    OUT.write_text(text, encoding="utf-8")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
