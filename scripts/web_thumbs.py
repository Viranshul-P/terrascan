"""Small copies of each showcase city picture for the website's city cards (step 5.3a, prototype E).

The full pictures (web/public/data/<city>/rgb_<year>.webp, up to 680 KB) are only needed on the map.
A card is about 300 px wide, so a 480 px wide copy (sharp on 1.5x screens) is plenty.
    python scripts/web_thumbs.py
"""

import json
from pathlib import Path

from PIL import Image

DATA = Path("web/public/data")
WIDTH = 480


def main():
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    for city in index["cities"]:
        for year in index["years"]:
            src = DATA / city["id"] / f"rgb_{year}.webp"
            img = Image.open(src)
            img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
            out = src.with_name(f"thumb_{year}.webp")
            img.save(out, quality=82)
            print(f"{out}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
