from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch
import yaml

from src.bands import (
    EuroSATMS,
    IndiaBands,
    all_channel_names,
    calibrate_bands,
    channel_stack,
    channel_stats,
    india_array_with_b10,
    normalised_difference,
    standardise,
)
from src.imagery import to_eurosat_rgb

CFG = yaml.safe_load(Path("configs/bands.yaml").read_text(encoding="utf-8"))
ALL = CFG["all_bands"]


def raw_image(seed=0, size=4):
    """A fake (13, size, size) raw image with values like Sentinel-2 digital numbers."""
    rng = np.random.default_rng(seed)
    return rng.integers(0, 6000, size=(13, size, size)).astype(np.uint16)


# ---------- indices ----------


def test_ndvi_of_known_numbers():
    # NIR 3000, red 1000 -> (3000-1000)/(3000+1000) = 0.5
    assert normalised_difference(np.array([3000.0]), np.array([1000.0]))[0] == pytest.approx(0.5)


def test_normalised_difference_zero_sum_is_zero_not_nan():
    out = normalised_difference(np.array([0.0, 5.0]), np.array([0.0, 5.0]))
    assert np.all(np.isfinite(out)) and out.tolist() == [0.0, 0.0]


def test_normalised_difference_stays_in_range():
    rng = np.random.default_rng(1)
    a, b = rng.integers(0, 10000, 1000), rng.integers(0, 10000, 1000)
    out = normalised_difference(a, b)
    assert out.min() >= -1 and out.max() <= 1


def test_normalised_difference_signs():
    # water: green > NIR gives a positive NDWI; plants: NIR > red gives a positive NDVI
    assert normalised_difference(np.array([900.0]), np.array([200.0]))[0] > 0
    assert normalised_difference(np.array([200.0]), np.array([900.0]))[0] < 0


# ---------- stacking ----------


def test_variant_channel_counts_and_order():
    raw = raw_image()
    for name, channels in CFG["variants"].items():
        stack = channel_stack(raw, channels, CFG)
        assert stack.shape == (len(channels), 4, 4), name
        assert stack.dtype == np.float32


def test_rgb_channels_match_the_baseline_stretch():
    raw = raw_image()
    stack = channel_stack(raw, CFG["rgb"], CFG)
    for k, band in enumerate(CFG["rgb"]):
        expected = to_eurosat_rgb(raw[ALL.index(band)], CFG["scale_max"]) / 255
        assert np.allclose(stack[k], expected)
    assert stack.min() >= 1 / 255 and stack.max() <= 1.0


def test_non_rgb_band_is_value_over_10000_without_clipping():
    raw = np.zeros((13, 2, 2), dtype=np.uint16)
    raw[ALL.index("B08")] = 9000
    stack = channel_stack(raw, ["B08"], CFG)
    assert np.allclose(stack, 0.9)


def test_index_channel_uses_the_configured_bands():
    raw = np.zeros((13, 2, 2), dtype=np.float32)
    raw[ALL.index("B08")] = 3000
    raw[ALL.index("B04")] = 1000
    assert np.allclose(channel_stack(raw, ["ndvi"], CFG), 0.5)


def test_unknown_channel_is_an_error():
    with pytest.raises(ValueError):
        channel_stack(raw_image(), ["B99"], CFG)


# ---------- standardising ----------


def fake_stats():
    return {n: {"mean": 0.5, "std": 0.25} for n in all_channel_names(CFG)}


def test_standardise_uses_the_stats():
    stack = np.full((1, 2, 2), 0.75, dtype=np.float32)
    out = standardise(stack, ["B08"], fake_stats(), CFG)
    assert np.allclose(out, 1.0)


def test_standardise_rgb_can_use_other_numbers():
    stack = np.full((3, 2, 2), 0.5, dtype=np.float32)
    norm = {"mean": [0.5, 0.5, 0.5], "std": [0.1, 0.1, 0.1]}
    assert np.allclose(standardise(stack, CFG["rgb"], fake_stats(), CFG, norm), 0.0)


def test_b10_is_a_constant_zero_on_every_input():
    names = CFG["variants"]["all_bands"]
    out = standardise(channel_stack(raw_image(), names, CFG), names, fake_stats(), CFG)
    assert np.all(out[names.index("B10")] == 0)
    # and the raw B10 values do not matter at all
    other = raw_image()
    other[ALL.index("B10")] = 12345
    out2 = standardise(channel_stack(other, names, CFG), names, fake_stats(), CFG)
    assert np.allclose(out[names.index("B10")], out2[names.index("B10")])


def test_channel_stats_match_a_direct_computation():
    batches = [np.stack([raw_image(1), raw_image(2)]), np.stack([raw_image(3)])]
    stats = channel_stats(batches, CFG)
    assert set(stats) == set(all_channel_names(CFG))
    direct = np.concatenate(
        [channel_stack(r, ["B08"], CFG).ravel() for b in batches for r in b]
    ).astype(np.float64)
    assert stats["B08"]["mean"] == pytest.approx(direct.mean(), rel=1e-5)
    assert stats["B08"]["std"] == pytest.approx(direct.std(), rel=1e-4)


# ---------- datasets ----------


def test_eurosat_ms_dataset_returns_the_variant_channels_and_label():
    array = np.stack([raw_image(i) for i in range(3)])
    index = pd.DataFrame(
        {
            "path": ["a", "b", "c"],
            "label": ["Forest", "River", "Highway"],
            "split": ["train", "train", "val"],
            "row": [0, 1, 2],
        }
    )
    ds = EuroSATMS(array, index, "train", CFG["variants"]["rgb_nir"], fake_stats(), CFG)
    assert len(ds) == 2
    x, y = ds[1]
    assert x.shape == (4, 4, 4) and x.dtype == torch.float32
    assert y == 8  # River's class number (alphabetical list)
    assert len(EuroSATMS(array, index, "val", ["B08"], fake_stats(), CFG)) == 1


def test_calibrate_bands_applies_gain_and_shift_and_never_goes_below_zero():
    values = np.full((2, 2, 2), 1000.0)
    cal = {"bands": {"B08": {"gain": 2.0, "shift": 10.0}, "B11": {"gain": 0.5, "shift": -900.0}}}
    out = calibrate_bands(values, cal, ["B08", "B11"])
    assert np.allclose(out[..., 0], 2010.0) and np.allclose(out[..., 1], 0.0)
    with pytest.raises(KeyError):
        calibrate_bands(values, cal, ["B08", "B12"])  # no silent identity for a missing band


def test_india_array_puts_the_twelve_bands_in_their_slots_and_zero_for_b10():
    have = [b for b in ALL if b != "B10"]
    values = np.stack([np.full((3, 3), 100 * (k + 1)) for k in range(12)], axis=-1)
    out = india_array_with_b10(values, CFG)
    assert out.shape == (3, 3, 13)
    for k, band in enumerate(have):
        assert np.all(out[..., ALL.index(band)] == 100 * (k + 1))
    assert np.all(out[..., ALL.index("B10")] == 0)


def test_india_dataset_cuts_a_patch_at_row_and_col_and_gives_the_same_channels_as_eurosat_side():
    values = raw_image(5, size=8).transpose(1, 2, 0).astype(np.float64)  # (8, 8, 13)
    patches = pd.DataFrame(
        {"file": ["x.png"], "area": ["a1"], "row": [4], "col": [4], "final_label": ["Residential"]}
    )
    names = CFG["variants"]["rgb_indices"]
    ds = IndiaBands(patches, {"a1": values}, names, fake_stats(), CFG, size=4)
    x, y = ds[0]
    assert y == 7  # Residential
    # the same 4 x 4 corner through the EuroSAT-side functions gives identical numbers
    corner = values[4:8, 4:8].transpose(2, 0, 1)
    expected = standardise(channel_stack(corner, names, CFG), names, fake_stats(), CFG)
    assert np.allclose(x.numpy(), expected)


def test_band_order_is_torchgeos_order_for_eurosat_ms_and_ssl4eo_order_is_the_weights_order():
    from torchgeo.datasets import EuroSAT
    from torchgeo.models import ResNet18_Weights

    assert CFG["all_bands"] == list(EuroSAT.all_band_names)
    ssl4eo = ResNet18_Weights.SENTINEL2_ALL_MOCO.meta["bands"]
    fixed = ["B8A" if b == "B8a" else ("B" + b[1:].zfill(2) if len(b) == 2 else b) for b in ssl4eo]
    assert CFG["ssl4eo_s12_band_order"] == fixed
    assert sorted(CFG["all_bands"]) == sorted(CFG["ssl4eo_s12_band_order"])


def test_identity_calibration_changes_nothing():
    from src.bands import identity_calibration

    values = np.random.default_rng(0).uniform(0, 5000, size=(3, 3, 2))
    out = calibrate_bands(values, identity_calibration(["B08", "B11"]), ["B08", "B11"])
    assert np.allclose(out, values)


# ---- real data (skipped where the git-ignored files are missing, e.g. in CI) ----
MS_ARRAY = Path(CFG["eurosat_ms"]["array_path"])
MS_INDEX = Path(CFG["eurosat_ms"]["index_path"])
STATS = Path(CFG["stats_path"])


@pytest.mark.skipif(
    not (MS_ARRAY.exists() and MS_INDEX.exists() and STATS.exists()), reason="needs data"
)
def test_real_eurosat_ms_gives_every_variant_finite_inputs_and_the_right_shapes():
    import json

    array = np.load(MS_ARRAY, mmap_mode="r")
    index = pd.read_csv(MS_INDEX)
    stats = json.loads(STATS.read_text(encoding="utf-8"))
    assert array.shape == (27000, 13, 64, 64) and len(index) == 27000
    assert index["split"].value_counts().to_dict() == {"train": 18900, "val": 4050, "test": 4050}
    for name, channels in CFG["variants"].items():
        ds = EuroSATMS(array, index, "val", channels, stats, CFG)
        x, y = ds[0]
        assert x.shape == (len(channels), 64, 64) and torch.isfinite(x).all(), name
    # standardised train channels (other than RGB, B10) are centred: mean near 0, std near 1
    ds = EuroSATMS(array, index, "train", ["B08", "ndvi"], stats, CFG)
    batch = torch.stack([ds[i][0] for i in range(0, len(ds), 200)])
    assert abs(batch[:, 0].mean()) < 0.2 and 0.7 < batch[:, 0].std() < 1.3


INDIA_BANDS = Path(CFG["india_bands_dir"])
CALIBRATION = Path(CFG["calibration_path"])


@pytest.mark.skipif(
    not (INDIA_BANDS.exists() and CALIBRATION.exists() and STATS.exists()), reason="needs data"
)
def test_real_indian_rgb_channels_equal_the_existing_patch_pngs():
    import json

    from PIL import Image

    from src.bands_data import load_india_arrays

    calibration = json.loads(CALIBRATION.read_text(encoding="utf-8"))
    stats = json.loads(STATS.read_text(encoding="utf-8"))
    arrays = load_india_arrays(CFG, calibration)
    patches = pd.read_csv(CFG["india_patches_csv"]).head(20).assign(final_label="Residential")
    ds = IndiaBands(
        patches, arrays, CFG["rgb"], stats, CFG, rgb_norm={"mean": [0] * 3, "std": [1] * 3}
    )
    for i, row in patches.iterrows():
        png = np.array(Image.open(Path("data/india/patches") / row["file"]).convert("RGB")) / 255
        x, _ = ds[i]
        assert np.allclose(x.numpy().transpose(1, 2, 0), png, atol=1e-6)
