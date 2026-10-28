"""Checks on macro-F1, using small examples worked out by hand."""

import pytest
import torch

from src.metrics import macro_f1


def test_perfect_predictions_give_one():
    labels = torch.tensor([0, 1, 2, 2])
    assert macro_f1(labels, labels, num_classes=3) == pytest.approx(1.0)


def test_hand_worked_example():
    labels = torch.tensor([0, 0, 1, 1])
    preds = torch.tensor([0, 1, 1, 1])
    # class 0: TP 1, FP 0, FN 1 -> F1 = 2/(2+0+1) = 2/3
    # class 1: TP 2, FP 1, FN 0 -> F1 = 4/(4+1+0) = 4/5
    expected = (2 / 3 + 4 / 5) / 2
    assert macro_f1(preds, labels, num_classes=2) == pytest.approx(expected)


def test_every_class_counts_equally():
    # 9 images of class 0 all right, the 1 image of class 1 wrong:
    # accuracy is 0.9, but macro-F1 is pulled down by the missed small class.
    labels = torch.tensor([0] * 9 + [1])
    preds = torch.tensor([0] * 10)
    # class 0: TP 9, FP 1, FN 0 -> 18/19 ; class 1: TP 0 -> 0
    assert macro_f1(preds, labels, num_classes=2) == pytest.approx((18 / 19 + 0) / 2)
