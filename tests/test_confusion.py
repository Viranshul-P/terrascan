import json

from src.confusion import pick_best_model, top_confused_pairs


def test_top_confused_pairs_adds_both_directions():
    matrix = [
        [10, 1, 0],
        [4, 10, 2],
        [0, 3, 10],
    ]
    # pair (0,1): 1 + 4 = 5; pair (1,2): 2 + 3 = 5; pair (0,2): 0 -> left out
    pairs = top_confused_pairs(matrix, k=5)
    assert pairs == [(0, 1, 1, 4), (1, 2, 2, 3)]


def test_top_confused_pairs_keeps_only_k():
    matrix = [
        [0, 5, 1],
        [0, 0, 2],
        [0, 0, 0],
    ]
    assert top_confused_pairs(matrix, k=1) == [(0, 1, 5, 0)]


def test_pick_best_model_uses_mean_val_acc(tmp_path):
    accs = {"a": [0.90, 0.99], "b": [0.95, 0.96]}  # means 0.945 and 0.955
    candidates = []
    for name, values in accs.items():
        for seed, acc in zip([42, 43], values):
            run = tmp_path / name / f"seed{seed}"
            run.mkdir(parents=True)
            (run / "metrics.json").write_text(json.dumps({"best_val_acc": acc}))
        candidates.append({"name": name, "run_dir": str(tmp_path / name)})
    best, mean = pick_best_model(candidates, [42, 43])
    assert best["name"] == "b"
    assert abs(mean - 0.955) < 1e-9
