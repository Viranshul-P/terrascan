"""Step 5.2b: the API, with a saved Ahmedabad tile instead of the network and a fake model.

The real model is git-ignored, so CI uses a fake one that calls every patch Residential.
The last test uses the real ONNX model when it is on this machine (skips otherwise).
"""

import base64
import io
import json
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import rasterio
import yaml
from affine import Affine
from fastapi.testclient import TestClient
from PIL import Image

import src.live
from api.main import CONFIG, create_app
from src.classes import CLASSES
from src.live import BoxError, box_size_km, check_request, load_context, pick_scenes

TILE = Path("tests/fixtures/ahmedabad_tile.npz")  # 192x192 px = 3x3 patches, real values
BOX = [72.534, 23.013, 72.554, 23.031]  # about 2 x 2 km, where the saved tile is
RESIDENTIAL = CLASSES.index("Residential")


class FakeSession:
    """Stands in for the ONNX model: every patch gets Residential."""

    def run(self, names, feeds):
        logits = np.zeros((len(feeds["image"]), len(CLASSES)), dtype=np.float32)
        logits[:, RESIDENTIAL] = 5
        return [logits]


def fake_info():
    return {"image_size": 64, "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225],
            "classes": CLASSES}


def fake_fetch(bbox, window, cfg):
    """The saved tile, as if it were the median of one downloaded scene."""
    tile = np.load(TILE)
    year = "2018" if window.endswith("2018-02-28") else "2026"
    scenes = [{"id": f"scene_{year}", "date": f"{year}-01-15", "cloud": 0.0}]
    return (tile[f"values_{year}"].astype(np.float32), tile["has_data"], str(tile["crs"]),
            Affine(*tile["grid"]), "43QBF", scenes)


@pytest.fixture
def fake_ctx(monkeypatch):
    """Settings from configs/api.yaml with the fake model (the network is still real here)."""
    monkeypatch.setattr(src.live, "load_model", lambda *a: (FakeSession(), fake_info()))
    return load_context(CONFIG)


@pytest.fixture
def client(fake_ctx, monkeypatch):
    """The API with the fake model and the saved tile instead of downloads."""
    monkeypatch.setattr(src.live, "fetch_composite", fake_fetch)
    return TestClient(create_app(fake_ctx))


def decode(url, media_type):
    head, data = url.split(",", 1)
    assert head == f"data:{media_type};base64"
    return base64.b64decode(data)


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "years": ["2018", "2026"], "max_side_km": 10,
                               "timeout_s": 60}


def test_predict_returns_showcase_format(client):
    response = client.post("/predict", json={"bbox": BOX, "year": "2026"})
    assert response.status_code == 200, response.text
    body = response.json()
    # Same keys as a showcase summary.json, except the change table (one year only).
    summary = json.loads(Path("web/public/data/ahmedabad/summary.json").read_text("utf-8"))
    for key in summary:
        if key not in {"id", "name", "changed_patches", "changed_km2", "changes"}:
            assert key in body, key
    assert body["n_patches"] == 9 and body["grid_rows"] == 3 and body["grid_cols"] == 3
    assert body["patch_counts"]["2026"]["Residential"] == 9
    assert body["km2_per_patch"] == 0.4096
    assert body["areas_km2"]["2026"]["Residential"] == round(9 * 0.4096, 4)
    assert body["years"]["2026"]["n_scenes"] == 1
    features = body["patches_geojson"]["features"]
    assert len(features) == 9
    assert features[0]["properties"]["class_2026"] == "Residential"
    assert "changed" not in features[0]["properties"]
    for lon, lat in body["overlay_corners"]:
        assert 72.53 < lon < 72.56 and 23.01 < lat < 23.04


def test_predict_files_decode(client):
    files = client.post("/predict", json={"bbox": BOX, "year": "2018"}).json()["files"]
    overlay = Image.open(io.BytesIO(decode(files["overlay"]["2018"], "image/png")))
    assert overlay.size == (3, 3)  # one pixel per patch
    rgb = Image.open(io.BytesIO(decode(files["rgb"]["2018"], "image/webp")))
    assert rgb.size == (96, 96)  # 192 px / downscale 2
    with rasterio.MemoryFile(decode(files["geotiff"]["2018"], "image/tiff")) as memfile:
        with memfile.open() as src:
            assert src.crs.to_string() == "EPSG:32643"
            assert src.transform.a == 640 and src.transform.e == -640  # one pixel = one patch
            assert (src.transform.c, src.transform.f) == (247360.0, 2549060.0)
            assert (src.read(1) == RESIDENTIAL).all()


@pytest.mark.parametrize("bbox, year, words", [
    ([72.4, 23.0, 72.6, 23.2], "2026", "at most 10 x 10 km"),   # about 20 x 22 km
    (BOX, "2020", "Year must be one of 2018, 2026"),
    ([72.6, 23.0, 72.5, 23.1], "2026", "west < east"),
    ([72.5, 23.0, 72.6], "2026", "4 numbers"),
    ([72.5, 23.0, 72.501, 23.001], "2026", "at least"),
])
def test_bad_requests_get_clear_errors(client, bbox, year, words):
    response = client.post("/predict", json={"bbox": bbox, "year": year})
    assert response.status_code == 422
    assert words in response.json()["detail"]


def test_no_scene_gives_clear_error(fake_ctx, monkeypatch):
    monkeypatch.setattr(src.live, "search_scenes", lambda *a: [])  # the search finds nothing
    response = TestClient(create_app(fake_ctx)).post("/predict", json={"bbox": BOX, "year": "2026"})
    assert response.status_code == 422
    assert "No clear Sentinel-2 picture" in response.json()["detail"]


def test_timeout_gives_clear_error(fake_ctx, monkeypatch):
    def slow_fetch(*args):
        time.sleep(1)
        return fake_fetch(*args)
    monkeypatch.setattr(src.live, "fetch_composite", slow_fetch)
    fake_ctx["cfg"]["timeout_s"] = 0.2
    response = TestClient(create_app(fake_ctx)).post("/predict", json={"bbox": BOX, "year": "2026"})
    assert response.status_code == 504
    assert "longer than 0.2 seconds" in response.json()["detail"]


def test_cors_lets_the_website_call(client):
    response = client.options("/predict", headers={
        "Origin": "https://example.org", "Access-Control-Request-Method": "POST"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] in {"*", "https://example.org"}


def scene(tile, date, cloud, generated="2020-01-01"):
    return SimpleNamespace(id=f"{tile}_{date}_{generated}", properties={
        "s2:mgrs_tile": tile, "datetime": f"{date}T05:00:00Z", "eo:cloud_cover": cloud,
        "s2:generation_time": generated})


def test_pick_scenes_one_tile_clearest_first():
    items = [scene("43QBF", "2026-01-01", 5), scene("43QBF", "2026-01-06", 1),
             scene("43QBF", "2026-01-11", 3), scene("43QBF", "2026-01-11", 3, "2024-01-01"),
             scene("43QCF", "2026-01-02", 0), scene("43QCF", "2026-01-07", 0)]
    tile, picked = pick_scenes(items, max_scenes=2)
    assert tile == "43QBF"  # 3 dates beat 2, even though 43QCF is clearer
    assert [s.properties["datetime"][:10] for s in picked] == ["2026-01-06", "2026-01-11"]
    assert picked[1].properties["s2:generation_time"] == "2024-01-01"  # newest copy of the date


def test_box_size_and_check():
    width, height = box_size_km([72.5, 23.0, 72.6, 23.1])
    assert abs(height - 11.132) < 0.001 and abs(width - 10.24) < 0.01  # narrower: cos(23 deg)
    cfg = yaml.safe_load(Path(CONFIG).read_text(encoding="utf-8"))
    check_request(BOX, "2026", cfg)  # no error
    with pytest.raises(BoxError):
        check_request([72.5, 23.0, 72.6, 23.1], "2026", cfg)  # 11.1 km tall: too big


def test_api_config_matches_showcase():
    api = yaml.safe_load(Path(CONFIG).read_text(encoding="utf-8"))
    showcase = yaml.safe_load(Path("configs/showcase.yaml").read_text(encoding="utf-8"))
    for key in ["max_cloud", "years", "scale_max", "patch_size", "calibration_path", "onnx_path",
                "onnx_info_path", "batch_size", "india_eval_config", "india_config",
                "rgb_downscale", "rgb_webp_quality", "change_config"]:
        assert api[key] == showcase[key], key


def test_real_model_on_saved_tile(monkeypatch):
    cfg = yaml.safe_load(Path(CONFIG).read_text(encoding="utf-8"))
    if not Path(cfg["onnx_path"]).exists():
        pytest.skip("the exported ONNX model is not on this machine")
    monkeypatch.setattr(src.live, "fetch_composite", fake_fetch)
    body = TestClient(create_app(load_context(CONFIG))).post(
        "/predict", json={"bbox": BOX, "year": "2026"}).json()
    assert body["n_patches"] == 9
    for feature in body["patches_geojson"]["features"]:
        assert feature["properties"]["class_2026"] in CLASSES
        assert 0 < feature["properties"]["confidence_2026"] <= 1
