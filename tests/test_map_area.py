"""Step 8.12: the command-line mapper, on the saved Ahmedabad tile, fake model (no network)."""

import json

import rasterio

import src.live
from src.map_area import main
from tests.test_api import BOX, fake_ctx, fake_fetch  # noqa: F401  (fake_ctx is a fixture)


def test_two_years_write_files_and_count_changes(fake_ctx, monkeypatch, tmp_path):  # noqa: F811
    monkeypatch.setattr(src.live, "fetch_composite", fake_fetch)
    monkeypatch.setattr("src.map_area.load_context", lambda cfg: fake_ctx)
    out = tmp_path / "area"
    main(["--bbox", *map(str, BOX), "--years", "2018", "2026", "--out", str(out)])
    for y in ["2018", "2026"]:
        with rasterio.open(out / f"classes_{y}.tif") as tif:
            assert tif.crs is not None and tif.read(1).shape == (3, 3)
        assert (out / f"rgb_{y}.webp").stat().st_size > 0
    s = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    # the fake model calls every square Residential, so nothing changes
    assert s["changed_squares"] == {"changed": 0, "compared": 9}
    g = json.loads((out / "patches.geojson").read_text(encoding="utf-8"))
    assert len(g["features"]) == 9
    assert {"class_2018", "class_2026"} <= set(g["features"][0]["properties"])
