"""Step 6.2: the Space folder has what Hugging Face needs; the Dockerfile names the model commit."""

from pathlib import Path

import yaml

from src.hf_space import build_space

CONFIG = yaml.safe_load(Path("configs/hf_space.yaml").read_text(encoding="utf-8"))


def test_space_folder(tmp_path):
    out = build_space({**CONFIG, "out_dir": str(tmp_path / "space")})
    assert (out / "api" / "main.py").exists()
    assert (out / "src" / "live.py").exists()
    assert (out / "configs" / "api.yaml").exists()
    assert (out / "results" / "imagery_calibration.json").exists()
    # The model is downloaded in the image, never copied into the Space.
    assert not list(out.rglob("*.onnx"))
    # The Space has one Dockerfile, at the top; api/Dockerfile* are not copied.
    assert sorted(p.name for p in (out / "api").glob("Dockerfile*")) == []
    docker = (out / "Dockerfile").read_text(encoding="utf-8")
    assert f"ARG MODEL_REPO={CONFIG['model_repo']}" in docker
    assert f"ARG MODEL_REVISION={CONFIG['model_revision']}" in docker
    # Hugging Face reads these settings from the top of README.md.
    readme = (out / "README.md").read_text(encoding="utf-8")
    assert readme.startswith("---\n")
    assert "sdk: docker" in readme and "app_port: 8000" in readme


def test_space_dockerfile_port_matches_readme():
    docker = Path("api/Dockerfile.space").read_text(encoding="utf-8")
    assert "--port\", \"8000\"" in docker
