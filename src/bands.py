"""Spectral bands for EuroSAT and the Indian patches (step 8.3a).

What is here (no training; 8.3b compares the variants):
  - channel_stack: turn 13-band raw values into the channels of a variant (bands and/or indices);
  - standardise: scale every channel, the same way on the EuroSAT side and the Indian side;
  - two Datasets: EuroSATMS (a memmap of EuroSAT_MS) and IndiaBands (patches cut from area arrays).

Raw values are Sentinel-2 digital numbers (reflectance x 10000); band order is `all_bands` in
configs/bands.yaml. RGB channels are stretched exactly like the baseline (0..2750 -> 1..255, then
/255), so an RGB-only variant matches the 4.1 pipeline. Every other band is value / 10000 (no
clipping). Indices use the raw values.
"""

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from src.data import CLASSES
from src.imagery import to_eurosat_rgb


def normalised_difference(first, second):
    """(first - second) / (first + second), 0 where the sum is 0. In [-1, 1] for values >= 0."""
    first = np.asarray(first, dtype=np.float32)
    second = np.asarray(second, dtype=np.float32)
    total = first + second
    out = np.zeros_like(total)
    np.divide(first - second, total, out=out, where=total > 0)
    return np.clip(out, -1.0, 1.0)


def channel_stack(raw, names, cfg):
    """Float32 (len(names), H, W) channels for a variant.

    raw: (13, H, W) raw values in cfg["all_bands"] order (any numeric type).
    names: band names (e.g. "B08") and/or index names (e.g. "ndvi"), in the wanted order.
    """
    all_bands = cfg["all_bands"]
    raw = np.asarray(raw)
    channels = []
    for name in names:
        if name in cfg["indices"]:
            first, second = cfg["indices"][name]
            channels.append(
                normalised_difference(raw[all_bands.index(first)], raw[all_bands.index(second)])
            )
        elif name in cfg["rgb"]:
            dn = raw[all_bands.index(name)]
            channels.append(to_eurosat_rgb(dn, cfg["scale_max"]).astype(np.float32) / 255)
        elif name in all_bands:
            channels.append(
                raw[all_bands.index(name)].astype(np.float32) / cfg["reflectance_scale"]
            )
        else:
            raise ValueError(f"unknown channel {name!r}")
    return np.stack(channels).astype(np.float32)


def all_channel_names(cfg):
    """Every band, then every index: the channels whose stats are saved."""
    return list(cfg["all_bands"]) + list(cfg["indices"])


def standardise(stack, names, stats, cfg, rgb_norm=None):
    """Scale each channel: (x - mean) / std with the EuroSAT-train stats in `stats`.

    rgb_norm: optional {"mean": [r, g, b], "std": [r, g, b]} used for B04/B03/B02 instead (the
    baseline feeds ImageNet-pretrained weights ImageNet's numbers). Bands in
    cfg["missing_on_india"] (B10) come
    out as exactly 0 on both sides: the Indian L2A scenes cannot supply them.
    """
    out = np.empty_like(stack)
    rgb_order = cfg["rgb"]
    for k, name in enumerate(names):
        if name in cfg["missing_on_india"]:
            out[k] = 0.0
        elif rgb_norm is not None and name in rgb_order:
            i = rgb_order.index(name)
            out[k] = (stack[k] - rgb_norm["mean"][i]) / rgb_norm["std"][i]
        else:
            out[k] = (stack[k] - stats[name]["mean"]) / stats[name]["std"]
    return out


def channel_stats(raw_batches, cfg):
    """Mean and std of every channel over many (N, 13, H, W) raw batches (an iterable).
    Pooled over all pixels. Returns {name: {"mean": float, "std": float}}."""
    names = all_channel_names(cfg)
    total, total_sq, count = np.zeros(len(names)), np.zeros(len(names)), 0
    for batch in raw_batches:
        for raw in batch:
            channels = channel_stack(raw, names, cfg).astype(np.float64)
            total += channels.sum(axis=(1, 2))
            total_sq += (channels**2).sum(axis=(1, 2))
            count += channels.shape[1] * channels.shape[2]
    mean = total / count
    std = np.sqrt(total_sq / count - mean**2)
    return {n: {"mean": float(m), "std": float(s)} for n, m, s in zip(names, mean, std)}


class EuroSATMS(Dataset):
    """EuroSAT multispectral images of one split, as the channels of a variant.

    array: the (N, 13, 64, 64) uint16 memmap; index: DataFrame (path, label, split, row);
    returns (tensor (C, 64, 64), label number).
    """

    def __init__(self, array, index, split, names, stats, cfg, rgb_norm=None):
        self.array = array
        self.rows = index[index["split"] == split]["row"].tolist()
        self.labels = [CLASSES.index(c) for c in index[index["split"] == split]["label"]]
        self.names, self.stats, self.cfg, self.rgb_norm = names, stats, cfg, rgb_norm

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        raw = np.asarray(self.array[self.rows[i]])
        stack = channel_stack(raw, self.names, self.cfg)
        return torch.from_numpy(
            standardise(stack, self.names, self.stats, self.cfg, self.rgb_norm)
        ), (self.labels[i])


def calibrate_bands(raw_dn, calibration, bands):
    """gain * value + shift for each band in `bands` (list of names), on (H, W, len(bands)) values.
    Bands without an entry in the calibration are an error (no silent identity). Never below 0."""
    out = np.empty(raw_dn.shape, dtype=np.float64)
    for k, band in enumerate(bands):
        entry = calibration["bands"][band]
        out[..., k] = np.maximum(raw_dn[..., k] * entry["gain"] + entry["shift"], 0)
    return out


def identity_calibration(bands):
    """A calibration that changes nothing (gain 1, shift 0), for the "extra bands uncalibrated"
    check in 8.3b: the per-scene fits of the extra bands vary a lot
    (results/bands_calibration.json)."""
    return {"bands": {b: {"gain": 1.0, "shift": 0.0} for b in bands}}


class IndiaBands(Dataset):
    """Indian patches as the channels of a variant, cut from area arrays at the table's row/col.

    areas: {area name: (H, W, 13) calibrated values in cfg["all_bands"] order (B10 = placeholder)}.
    patches: DataFrame (file, area, row, col, final_label); returns (tensor, label number).
    """

    def __init__(self, patches, areas, names, stats, cfg, rgb_norm=None, size=64):
        self.patches, self.areas, self.size = patches.reset_index(drop=True), areas, size
        self.names, self.stats, self.cfg, self.rgb_norm = names, stats, cfg, rgb_norm
        self.labels = [CLASSES.index(c) for c in self.patches["final_label"]]

    def __len__(self):
        return len(self.patches)

    def __getitem__(self, i):
        row = self.patches.iloc[i]
        values = self.areas[row["area"]]
        patch = values[row["row"] : row["row"] + self.size, row["col"] : row["col"] + self.size]
        return self.to_tensor(patch), self.labels[i]

    def to_tensor(self, patch):
        """(H, W, 13) calibrated values (B10 is a placeholder) -> standardised tensor (C, H, W)."""
        raw = np.moveaxis(patch, -1, 0)
        stack = channel_stack(raw, self.names, self.cfg)
        return torch.from_numpy(standardise(stack, self.names, self.stats, self.cfg, self.rgb_norm))


def india_array_with_b10(values_12, cfg):
    """(H, W, 12) values without B10 -> (H, W, 13) with a zero B10 placeholder (see standardise)."""
    all_bands = cfg["all_bands"]
    out = np.zeros(values_12.shape[:2] + (len(all_bands),), dtype=values_12.dtype)
    have = [b for b in all_bands if b not in cfg["missing_on_india"]]
    for k, band in enumerate(have):
        out[..., all_bands.index(band)] = values_12[..., k]
    return out


def index_table(path):
    """The EuroSAT_MS index CSV as a DataFrame (path, label, split, row)."""
    return pd.read_csv(path)
