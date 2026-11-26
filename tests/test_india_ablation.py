"""Step 8.6: the 8 test-time views and the keep rule."""

import torch

from src.india_ablation import dihedral, kept


def test_dihedral_gives_8_distinct_views_of_the_same_pixels():
    x = torch.arange(16.0).reshape(1, 1, 4, 4)
    views = dihedral(x)
    assert len(views) == 8
    assert len({tuple(v.flatten().tolist()) for v in views}) == 8
    assert all(sorted(v.flatten().tolist()) == list(range(16)) for v in views)


def test_kept_needs_non_overlapping_ranges():
    ref = {"mean": 0.655, "std": 0.017}
    assert not kept(ref, {"mean": 0.678, "std": 0.029})
    assert kept(ref, {"mean": 0.72, "std": 0.02})
