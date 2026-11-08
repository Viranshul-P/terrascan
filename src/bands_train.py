"""Train and test the band variants (step 8.3b). The decision rule is in configs/bands_compare.yaml.

Run from the repo root:
    python -m src.bands_train --config configs/bands_compare.yaml --fast-dev-run
    python -m src.bands_train --config configs/bands_compare.yaml
    python -m src.bands_train --config configs/bands_compare.yaml --runs rgb --stage base

Stage "base": train the model on EuroSAT_MS train, keep the lowest-val-loss epoch ->
models/bands_<run>/seed<N>/.
Stage "loao": leave-one-area-out on the 3 Indian fine-tune areas. For each held-out area, fine-
tune the base
  model on the OTHER two areas (+ EuroSAT_MS train images, the unchanged 4.4 recipe) and predict
  the held-out
  one. Predictions go to results/bands_runs/<run>_<calibration>_seed<N>.csv. The TEST areas are
  never loaded.
Every finished piece is skipped on a re-run, so a long job can be stopped and resumed.
"""

import argparse
import json
from pathlib import Path

import pandas as pd
import timm
import torch
import torch.nn.functional as F
import torchgeo.models
import yaml
from torch import nn
from torch.utils.data import DataLoader, Dataset

from src.bands import EuroSATMS, IndiaBands, identity_calibration
from src.bands_data import l2a_bands, load_india_arrays
from src.data import CLASSES
from src.error_audit import assert_no_test_areas, loao_folds
from src.india_eval import load_labels, split_by_area
from src.india_finetune import finetune
from src.train import fit, save_run, seed_everything

RGB_FILTER = {"B04": 0, "B03": 1, "B02": 2}  # pretrained first-layer filter of red, green, blue


class NullRun:
    """Stands in for a W&B run: fit() only calls .log(). No W&B in this step."""

    def log(self, row):
        pass


class Flip90(Dataset):
    """Training augmentation on a tensor dataset: random flips and a random 90-degree turn.
    (Colour jitter is left out: it is defined for 3 colour channels only.)"""

    def __init__(self, dataset):
        self.dataset = dataset

    def __len__(self):
        return len(self.dataset)

    def __getitem__(self, i):
        x, y = self.dataset[i]
        if torch.rand(1).item() < 0.5:
            x = x.flip(-1)
        if torch.rand(1).item() < 0.5:
            x = x.flip(-2)
        return torch.rot90(x, int(torch.randint(0, 4, (1,)).item()), (-2, -1)), y


class InputStage(nn.Module):
    """Scale 64x64 -> image_size (bilinear), then optionally rescale each channel, then run the net.
    The rescale (x * scale + shift) is how the satellite weights get the number range they
    expect (2.4b)."""

    def __init__(self, net, image_size, scale=None, shift=None):
        super().__init__()
        self.net, self.image_size = net, image_size
        self.has_affine = scale is not None
        if self.has_affine:
            self.register_buffer(
                "scale", torch.tensor(scale, dtype=torch.float32).view(1, -1, 1, 1)
            )
            self.register_buffer(
                "shift", torch.tensor(shift, dtype=torch.float32).view(1, -1, 1, 1)
            )

    def forward(self, x):
        if self.image_size != x.shape[-1]:
            x = F.interpolate(x, size=(self.image_size,) * 2, mode="bilinear", align_corners=False)
        if self.has_affine:
            x = x * self.scale + self.shift
        return self.net(x)


def widen_first_conv(conv, names):
    """A copy of the pretrained RGB first layer for len(names) input channels: the red/green/blue
    filters go to B04/B03/B02, every other channel starts with zero filters."""
    new = nn.Conv2d(
        len(names),
        conv.out_channels,
        conv.kernel_size,
        conv.stride,
        conv.padding,
        bias=conv.bias is not None,
    )
    with torch.no_grad():
        new.weight.zero_()
        for k, name in enumerate(names):
            if name in RGB_FILTER:
                new.weight[:, k] = conv.weight[:, RGB_FILTER[name]]
        if conv.bias is not None:
            new.bias.copy_(conv.bias)
    return new


def build_run_model(spec, cfg, names, bands_cfg):
    """The network of one run (pretrained weights are downloaded once), wrapped in InputStage."""
    kind = spec["model"]["kind"]
    if kind == "efficientnet_b0":
        net = timm.create_model(spec["model"]["weights"], pretrained=True, num_classes=len(CLASSES))
        net.conv_stem = widen_first_conv(net.conv_stem, names)
        return InputStage(net, cfg["image_size"])
    if kind == "resnet18_sat":
        weights = getattr(torchgeo.models.ResNet18_Weights, spec["model"]["weights"])
        net = torchgeo.models.resnet18(weights=weights, num_classes=len(CLASSES))
        assert net.conv1.in_channels == len(names), "channel count does not match the weights"
        if len(names) == 13:
            expected = bands_cfg["ssl4eo_s12_band_order"]
            assert list(names) == expected, f"sat_all channels must be in torchgeo order {expected}"
        scale = [cfg["ssl4eo_stats"][n][1] / 10000 for n in names]
        shift = [cfg["ssl4eo_stats"][n][0] / 10000 for n in names]
        return InputStage(net, cfg["image_size"], scale, shift)
    raise ValueError(f"unknown model kind {kind}")


def run_channels(spec, bands_cfg):
    return spec["channels"] if "channels" in spec else bands_cfg["variants"][spec["variant"]]


def run_rgb_norm(spec, cfg):
    """Per-colour numbers B04/B03/B02 are standardised with: ImageNet's for arm A (the pretrained
    weights were trained on them), our JPEG train stats for arm B (rule of 2.4b)."""
    if spec["arm"] == "A":
        return cfg["imagenet"]
    return json.loads(Path(cfg["jpeg_stats_path"]).read_text(encoding="utf-8"))


def uses_extra_bands(names, bands_cfg):
    """True if the run uses anything but B04/B03/B02, i.e. if the calibration choice matters."""
    return any(n not in bands_cfg["rgb"] for n in names)


class Context:
    """Everything the runs share: configs, stats, the EuroSAT_MS files, Indian arrays."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.bands = yaml.safe_load(Path(cfg["bands_config"]).read_text(encoding="utf-8"))
        self.stats = json.loads(Path(self.bands["stats_path"]).read_text(encoding="utf-8"))
        ms = self.bands["eurosat_ms"]
        self.array_path = ms["array_path"]
        self.index = pd.read_csv(ms["index_path"])
        self.ft_cfg = yaml.safe_load(Path(cfg["india_finetune_config"]).read_text(encoding="utf-8"))
        self.eval_cfg = yaml.safe_load(Path(cfg["india_eval_config"]).read_text(encoding="utf-8"))
        self._india = {}

    def india_arrays(self, calibration):
        """{area: (H, W, 13)} for the chosen calibration (cached)."""
        if calibration not in self._india:
            cal = json.loads(Path("results/bands_calibration.json").read_text(encoding="utf-8"))
            if calibration == "uncalibrated":
                extra = [b for b in l2a_bands(self.bands) if b not in self.bands["rgb"]]
                cal = {"bands": {**cal["bands"], **identity_calibration(extra)["bands"]}}
            self._india[calibration] = load_india_arrays(self.bands, cal)
        return self._india[calibration]

    def finetune_patches(self):
        """The Indian fine-tune-area patches with row/col; TEST areas are never loaded."""
        df = load_labels(self.eval_cfg["reviewed_csv"])
        finetune_df, _ = split_by_area(
            df, self.eval_cfg["test_areas"], self.eval_cfg["finetune_areas"]
        )
        assert_no_test_areas(finetune_df, self.eval_cfg["test_areas"])
        positions = pd.read_csv(self.bands["india_patches_csv"])[["file", "row", "col"]]
        merged = finetune_df.merge(positions, on="file", how="left", validate="one_to_one")
        assert merged["row"].notna().all(), "a labelled patch has no row/col in patches.csv"
        return merged

    def eurosat_ds(self, spec, split, train):
        names = run_channels(spec, self.bands)
        ds = EuroSATMS(
            self.array_path,
            self.index,
            split,
            names,
            self.stats,
            self.bands,
            run_rgb_norm(spec, self.cfg),
        )
        return Flip90(ds) if train else ds


def base_dir(name, seed, fast):
    return Path("models") / f"bands_{name}{'-fast-dev-run' if fast else ''}" / f"seed{seed}"


def train_base(name, spec, seed, ctx, device, fast):
    """Stage "base": EuroSAT_MS training. Returns the run directory."""
    cfg = ctx.cfg
    out_dir = base_dir(name, seed, fast)
    if (out_dir / "metrics.json").exists():
        print(f"{name} seed {seed}: base model exists, skipped")
        return out_dir
    names = run_channels(spec, ctx.bands)
    seed_everything(seed)
    t = cfg["train"]
    train_cfg = {**t, "epochs": 1 if fast else t["epochs"]}
    loader_args = {"batch_size": t["batch_size"], "num_workers": t["num_workers"]}
    loader_args["persistent_workers"] = t["num_workers"] > 0
    train_loader = DataLoader(ctx.eurosat_ds(spec, "train", True), shuffle=True, **loader_args)
    val_loader = DataLoader(ctx.eurosat_ds(spec, "val", False), **loader_args)
    model = build_run_model(spec, cfg, names, ctx.bands)
    print(f"{name} seed {seed}: training {len(names)} channels {names}")
    best_state, metrics, history = fit(
        model, train_loader, val_loader, train_cfg, device, NullRun(), 2 if fast else None
    )
    metrics["seed"] = seed
    metrics["channels"] = names
    run_cfg = {
        "run_name": f"bands_{name}",
        "spec": spec,
        "train": train_cfg,
        "seed": seed,
        "image_size": cfg["image_size"],
        "fast_dev_run": fast,
    }
    save_run(out_dir, best_state, run_cfg, metrics, history)
    print(
        f"  saved {out_dir}: best val acc {metrics['best_val_acc']:.4f} (epoch "
        f"{metrics['best_epoch']})"
    )
    return out_dir


@torch.no_grad()
def predict_india(model, dataset, device):
    """(class numbers, confidence) for every item of an IndiaBands dataset, float32, no "
    "augmentation."""
    model.to(device).eval()
    preds, confs = [], []
    for start in range(0, len(dataset), 64):
        batch = torch.stack([dataset[i][0] for i in range(start, min(start + 64, len(dataset)))])
        conf, pred = torch.softmax(model(batch.to(device)).float(), dim=1).max(dim=1)
        preds.append(pred.cpu())
        confs.append(conf.cpu())
    return torch.cat(preds), torch.cat(confs)


def loao_csv_path(cfg, name, calibration, seed, fast):
    folder = Path(cfg["runs_dir"]) / ("fast-dev-run" if fast else "")
    return folder / f"{name}_{calibration}_seed{seed}.csv"


def run_loao(name, spec, calibration, seed, ctx, device, fast):
    """Stage "loao" for one run / calibration / seed. Writes the CSV of held-out predictions."""
    cfg = ctx.cfg
    out_csv = loao_csv_path(cfg, name, calibration, seed, fast)
    if out_csv.exists():
        print(f"{name} {calibration} seed {seed}: LOAO exists, skipped")
        return
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    names = run_channels(spec, ctx.bands)
    rgb_norm = run_rgb_norm(spec, cfg)
    state = torch.load(base_dir(name, seed, fast) / "best.pt", map_location="cpu")
    ft_cfg = {**ctx.ft_cfg, "seed": seed}
    if fast:
        ft_cfg["epochs"] = 1
    areas = ctx.india_arrays(calibration)
    rows = []
    for area, train_df, held_out in loao_folds(ctx.finetune_patches()):
        seed_everything(seed)
        model = build_run_model(spec, cfg, names, ctx.bands)
        model.load_state_dict(state)
        india_train = Flip90(IndiaBands(train_df, areas, names, ctx.stats, ctx.bands, rgb_norm))
        eurosat = ctx.eurosat_ds(spec, "train", True)
        finetune(model, india_train, eurosat, ft_cfg, device, 2 if fast else None)
        test_ds = IndiaBands(held_out, areas, names, ctx.stats, ctx.bands, rgb_norm)
        preds, conf = predict_india(model, test_ds, device)
        truth = [CLASSES.index(c) for c in held_out["final_label"]]
        print(
            f"  {name} {calibration} seed {seed} held out {area}: acc "
            f"{(preds.numpy() == truth).mean():.3f}"
        )
        rows.append(
            pd.DataFrame(
                {
                    "file": held_out["file"].values,
                    "area": area,
                    "true": held_out["final_label"].values,
                    "pred": [CLASSES[p] for p in preds.tolist()],
                    "conf": [round(c, 4) for c in conf.tolist()],
                }
            )
        )
    pd.concat(rows, ignore_index=True).to_csv(out_csv, index=False)
    print(f"  saved {out_csv}")


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--fast-dev-run", action="store_true", help="2 batches, 1 epoch, 1 seed")
    parser.add_argument("--runs", nargs="*", help="run names (default: all in the config)")
    parser.add_argument("--stage", choices=["base", "loao", "both"], default="both")
    args = parser.parse_args(argv)
    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    ctx = Context(cfg)
    names = args.runs or list(cfg["runs"])
    seeds = cfg["seeds"][:1] if args.fast_dev_run else cfg["seeds"]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}; runs {names}; seeds {seeds}")
    for name in names:
        spec = cfg["runs"][name]
        channels = run_channels(spec, ctx.bands)
        calibrations = (
            cfg["calibrations"] if uses_extra_bands(channels, ctx.bands) else ["calibrated"]
        )
        for seed in seeds:
            if args.stage in ("base", "both"):
                train_base(name, spec, seed, ctx, device, args.fast_dev_run)
            if args.stage in ("loao", "both"):
                for calibration in calibrations:
                    run_loao(name, spec, calibration, seed, ctx, device, args.fast_dev_run)


if __name__ == "__main__":
    main()
