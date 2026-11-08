"""Tests for step 8.3b: first-layer widening, input stage, augmentation, lazy memmap, decision rule.
No network and no training."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch
import yaml
from torch import nn

from src.bands import EuroSATMS
from src.bands_report import beats, choose, loao_scores, verdict
from src.bands_train import Flip90, InputStage, uses_extra_bands, widen_first_conv


def test_widen_first_conv_copies_rgb_filters_and_zeroes_the_rest():
    conv = nn.Conv2d(3, 4, 3, padding=1, bias=False)
    names = ["B08", "B04", "B03", "B02", "ndvi"]
    wide = widen_first_conv(conv, names)
    assert wide.weight.shape == (4, 5, 3, 3)
    assert torch.equal(wide.weight[:, 1], conv.weight[:, 0])  # B04 = red filter
    assert torch.equal(wide.weight[:, 2], conv.weight[:, 1])  # B03 = green
    assert torch.equal(wide.weight[:, 3], conv.weight[:, 2])  # B02 = blue
    assert wide.weight[:, 0].abs().sum() == 0 and wide.weight[:, 4].abs().sum() == 0


def test_widened_model_starts_exactly_like_the_rgb_model():
    conv = nn.Conv2d(3, 4, 3, padding=1, bias=False)
    wide = widen_first_conv(conv, ["B04", "B03", "B02", "B08", "B11"])
    rgb = torch.randn(2, 3, 8, 8)
    extra = torch.randn(2, 2, 8, 8)  # anything: its filters are zero
    out_wide = wide(torch.cat([rgb, extra], dim=1))
    assert torch.allclose(out_wide, conv(rgb), atol=1e-6)


def test_input_stage_resizes_and_rescales_each_channel():
    net = nn.Identity()
    stage = InputStage(net, 8, scale=[2.0, 3.0], shift=[1.0, 0.0])
    x = torch.ones(1, 2, 4, 4)
    y = stage(x)
    assert y.shape == (1, 2, 8, 8)
    assert torch.allclose(y[:, 0], torch.full((1, 8, 8), 3.0))
    assert torch.allclose(y[:, 1], torch.full((1, 8, 8), 3.0))
    assert InputStage(net, 4)(x).shape == (1, 2, 4, 4)  # same size: no resize, no rescale


class Tiny(torch.utils.data.Dataset):
    def __len__(self):
        return 1

    def __getitem__(self, i):
        return torch.arange(2 * 4 * 4, dtype=torch.float32).view(2, 4, 4), 3


def test_flip90_keeps_shape_label_and_values():
    x0, _ = Tiny()[0]
    for _ in range(20):
        x, y = Flip90(Tiny())[0]
        assert x.shape == x0.shape and y == 3
        assert torch.equal(torch.sort(x.flatten()).values, torch.sort(x0.flatten()).values)


def test_eurosat_ms_opens_a_memmap_from_a_path(tmp_path):
    raw = np.random.default_rng(0).integers(0, 3000, size=(2, 13, 4, 4)).astype(np.uint16)
    path = tmp_path / "a.npy"
    np.save(path, raw)
    index = pd.DataFrame(
        {
            "path": ["a", "b"],
            "label": ["Forest", "River"],
            "split": ["train", "train"],
            "row": [0, 1],
        }
    )
    bands_cfg = yaml.safe_load(Path("configs/bands.yaml").read_text(encoding="utf-8"))
    stats = {
        n: {"mean": 0.0, "std": 1.0} for n in bands_cfg["all_bands"] + list(bands_cfg["indices"])
    }
    from_array = EuroSATMS(raw, index, "train", ["B08"], stats, bands_cfg)
    from_path = EuroSATMS(str(path), index, "train", ["B08"], stats, bands_cfg)
    assert torch.equal(from_array[1][0], from_path[1][0])


def test_uses_extra_bands():
    cfg = {"rgb": ["B04", "B03", "B02"]}
    assert not uses_extra_bands(["B04", "B03", "B02"], cfg)
    assert uses_extra_bands(["B04", "ndvi"], cfg)


def ms(mean, std):
    return {"mean": mean, "std": std}


def row(n_channels, cal, uncal, euro, with_uncal=True):
    loao = {"calibrated": ms(*cal)}
    if with_uncal:
        loao["uncalibrated"] = ms(*uncal)
    return {"n_channels": n_channels, "eurosat_val": ms(*euro), "loao": loao}


REF = row(3, (0.65, 0.02), None, (0.98, 0.002), with_uncal=False)


def test_beats_needs_more_than_the_two_stds_added():
    assert beats(ms(0.70, 0.01), ms(0.65, 0.02))  # 0.05 > 0.03
    assert not beats(ms(0.75, 0.125), ms(0.5, 0.125))  # 0.25 is not more than 0.25
    assert not beats(ms(0.60, 0.01), ms(0.65, 0.02))


def test_verdict_keep_fragile_worse_and_no_gain():
    good = row(4, (0.72, 0.01), (0.71, 0.01), (0.98, 0.002))
    assert verdict(good, REF)[0] == "keep"
    fragile = row(4, (0.72, 0.01), (0.66, 0.01), (0.98, 0.002))
    assert verdict(fragile, REF)[0] == "fragile"
    flat = row(4, (0.66, 0.01), (0.65, 0.01), (0.98, 0.002))
    assert verdict(flat, REF)[0] == "no clear gain"
    worse_india = row(4, (0.55, 0.01), (0.56, 0.01), (0.98, 0.002))
    assert verdict(worse_india, REF)[0] == "worse"
    bought_with_europe = row(4, (0.72, 0.01), (0.71, 0.01), (0.90, 0.002))
    assert verdict(bought_with_europe, REF)[0] == "worse"


def test_choose_prefers_fewest_channels_among_overlapping_keepers():
    table = {
        "rgb": REF,
        "rgb_nir": row(4, (0.72, 0.02), (0.72, 0.02), (0.98, 0.002)),
        "all_bands": row(13, (0.73, 0.02), (0.73, 0.02), (0.98, 0.002)),
    }
    verdicts = {"rgb_nir": "keep", "all_bands": "keep"}
    assert choose(table, "rgb", verdicts) == "rgb_nir"
    table["all_bands"] = row(13, (0.85, 0.01), (0.85, 0.01), (0.98, 0.002))  # clearly better
    assert choose(table, "rgb", verdicts) == "all_bands"
    assert choose(table, "rgb", {"rgb_nir": "fragile", "all_bands": "no clear gain"}) == "rgb"


def test_loao_scores_reads_accuracy_and_per_area(tmp_path):
    csv = tmp_path / "x.csv"
    pd.DataFrame(
        {
            "file": ["a", "b", "c", "d"],
            "area": ["A", "A", "B", "B"],
            "true": ["Forest", "River", "Forest", "Forest"],
            "pred": ["Forest", "Forest", "Forest", "Forest"],
            "conf": [0.9] * 4,
        }
    ).to_csv(csv, index=False)
    s = loao_scores(csv)
    assert s["accuracy"] == pytest.approx(0.75)
    assert s["per_area"] == {"A": 0.5, "B": 1.0}
    assert s["n_patches"] == 4
