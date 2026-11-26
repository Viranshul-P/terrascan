"""Step 8.4 part 2: the partial-label loss and the keep rule (no data, no GPU)."""

import math

import torch

from src.noisy_train import better, partial_label_loss


def test_partial_label_loss_is_cross_entropy_for_one_class():
    logits = torch.tensor([[2.0, 0.0, -1.0]])
    one = torch.tensor([[True, False, False]])
    ce = torch.nn.functional.cross_entropy(logits, torch.tensor([0]))
    assert torch.isclose(partial_label_loss(logits, one), ce)


def test_partial_label_loss_sums_the_allowed_set():
    logits = torch.zeros(1, 4)  # uniform: each class 0.25
    allowed = torch.tensor([[True, True, False, False]])
    assert math.isclose(partial_label_loss(logits, allowed).item(), -math.log(0.5), rel_tol=1e-6)


def test_better_needs_more_than_the_summed_stds():
    a = {"mean": 0.65, "std": 0.02}
    assert not better(a, {"mean": 0.68, "std": 0.02})
    assert better(a, {"mean": 0.70, "std": 0.02})
