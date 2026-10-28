"""Plot loss and accuracy curves from a run's history.csv.

Run from the repo root:
    python scripts/plot_curves.py models/small_cnn_v1/seed42 reports/figures/small_cnn_v1_curves.png
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # save to files, no window
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402


def main():
    run_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    history = pd.read_csv(run_dir / "history.csv")
    best_epoch = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))["best_epoch"]

    fig, (ax_loss, ax_acc) = plt.subplots(1, 2, figsize=(11, 4))
    for split in ["train", "val"]:
        ax_loss.plot(history["epoch"], history[f"{split}/loss"], marker=".", label=split)
        ax_acc.plot(history["epoch"], history[f"{split}/acc"], marker=".", label=split)
    for ax, name in [(ax_loss, "loss"), (ax_acc, "accuracy")]:
        ax.axvline(best_epoch, color="gray", linestyle="--", label=f"best epoch ({best_epoch})")
        ax.set_xlabel("epoch")
        ax.set_ylabel(name)
        ax.set_title(name)
        ax.legend()
    fig.suptitle(f"{run_dir.parent.name} / {run_dir.name}")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
