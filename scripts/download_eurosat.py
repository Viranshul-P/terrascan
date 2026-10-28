"""Download EuroSAT RGB from Zenodo, check the MD5, and unzip it into data/raw/.

Run from the repo root: python scripts/download_eurosat.py
"""

import hashlib
import sys
import urllib.request
import zipfile
from pathlib import Path

import yaml


def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    cfg = yaml.safe_load(open("configs/data.yaml"))
    raw_dir = Path(cfg["raw_dir"])
    raw_dir.mkdir(parents=True, exist_ok=True)
    zip_path = raw_dir / "EuroSAT_RGB.zip"

    if not zip_path.exists():
        print(f"Downloading {cfg['download_url']} ...")
        urllib.request.urlretrieve(cfg["download_url"], zip_path)

    checksum = md5_of(zip_path)
    if checksum != cfg["download_md5"]:
        print(f"ERROR: MD5 is {checksum}, expected {cfg['download_md5']}.")
        print(f"The file may be broken. Delete {zip_path} and run again.")
        sys.exit(1)
    print("MD5 OK")

    with zipfile.ZipFile(zip_path) as z:
        z.extractall(raw_dir)
    print(f"Extracted to {raw_dir}")


if __name__ == "__main__":
    main()
