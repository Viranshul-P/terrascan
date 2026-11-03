from pathlib import Path

import pandas as pd
import pytest
from PIL import Image

from src.india_dataset import build_table, count_table, make_card, write_dataset


def fake_inputs():
    reviewed = pd.DataFrame(
        {
            "file": ["a1.png", "a2.png", "b1.png", "b2.png"],
            "claude_label": ["Residential", "skip", "skip", "AnnualCrop"],
            "final_label": ["Residential", "Forest", "skip", "AnnualCrop"],
            "changed": [False, True, False, False],
            "area": ["area_a", "area_a", "area_b", "area_b"],
            "lat": [1.0, 1.1, 2.0, 2.1],
            "lon": [3.0, 3.1, 4.0, 4.1],
        }
    )
    patches = pd.DataFrame(
        {
            "file": ["a1.png", "a2.png", "b1.png", "b2.png", "unlabelled.png"],
            "scene_id": ["S_A", "S_A", "S_B", "S_B", "S_B"],
            "date": ["2026-01-21", "2026-01-21", "2026-02-15", "2026-02-15", "2026-02-15"],
        }
    )
    return reviewed, patches


def test_build_table_drops_skips_and_splits_by_area():
    reviewed, patches = fake_inputs()
    table = build_table(reviewed, patches, test_areas=["area_b"], finetune_areas=["area_a"])
    assert list(table["file_name"]) == ["b2.png", "a1.png", "a2.png"]  # sorted: test before train
    splits = dict(zip(table["file_name"], table["split"]))
    assert splits == {"a1.png": "train", "a2.png": "train", "b2.png": "test"}
    assert dict(zip(table["file_name"], table["first_labelled_by"])) == {
        "a1.png": "claude",
        "a2.png": "user",
        "b2.png": "claude",
    }
    assert set(table["scene_id"]) == {"S_A", "S_B"}


def test_build_table_rejects_area_in_no_split():
    reviewed, patches = fake_inputs()
    with pytest.raises(ValueError):
        build_table(reviewed, patches, test_areas=["area_b"], finetune_areas=[])


def test_counts_card_and_folder(tmp_path):
    reviewed, patches = fake_inputs()
    table = build_table(reviewed, patches, test_areas=["area_b"], finetune_areas=["area_a"])
    counts = count_table(table)
    assert counts["patches"] == 3
    assert counts["per_split"] == {"train": 2, "test": 1}
    assert counts["per_class"]["SeaLake"] == 0
    assert counts["per_class_test"]["AnnualCrop"] == 1
    assert counts["first_labelled_by"] == {"claude": 2, "user": 1}

    areas = [{"name": "area_a", "bbox": [1, 2, 3, 4]}, {"name": "area_b", "bbox": [5, 6, 7, 8]}]
    template = Path("src/india_dataset_card.md").read_text(encoding="utf-8")
    card = make_card(counts, table, areas, "cc-by-4.0", template)
    assert card.startswith("---\nlicense: cc-by-4.0\n")
    assert "Contains modified Copernicus Sentinel data 2026" in card

    src = tmp_path / "patches"
    src.mkdir()
    for name in patches["file"]:
        Image.new("RGB", (64, 64)).save(src / name)
    out = tmp_path / "hf"
    write_dataset(table, card, src, out)
    assert sorted(p.name for p in (out / "train").glob("*.png")) == ["a1.png", "a2.png"]
    assert [p.name for p in (out / "test").glob("*.png")] == ["b2.png"]
    meta = pd.read_csv(out / "test" / "metadata.csv")
    assert list(meta["file_name"]) == ["b2.png"]
    assert (out / "README.md").read_text(encoding="utf-8") == card
