"""Scores computed from predictions and true labels."""

import torch


def per_class_f1(preds, labels, num_classes):
    """F1 score for each class, as a list (index = label number).

    For one class: precision = of the images we called this class, how many were right;
    recall = of the images that really are this class, how many we found.
    F1 = 2 * TP / (2 * TP + FP + FN), which is the same as 2PR / (P + R).
    A class that never appears and is never predicted counts as F1 = 0.
    """
    f1_scores = []
    for c in range(num_classes):
        tp = ((preds == c) & (labels == c)).sum().item()  # said c, and it was c
        fp = ((preds == c) & (labels != c)).sum().item()  # said c, but it wasn't
        fn = ((preds != c) & (labels == c)).sum().item()  # was c, but we said something else
        denom = 2 * tp + fp + fn
        f1_scores.append(2 * tp / denom if denom > 0 else 0.0)
    return f1_scores


def macro_f1(preds, labels, num_classes):
    """F1 score per class, then the plain average over classes (every class counts equally)."""
    return float(torch.tensor(per_class_f1(preds, labels, num_classes)).mean())


def confusion_matrix(preds, labels, num_classes):
    """Count table: row = true class, column = predicted class. Diagonal = correct."""
    matrix = torch.zeros(num_classes, num_classes, dtype=torch.long)
    for true, pred in zip(labels.tolist(), preds.tolist()):
        matrix[true, pred] += 1
    return matrix
