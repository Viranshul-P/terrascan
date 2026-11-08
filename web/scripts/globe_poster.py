"""Turn the two globe photographs into WebP pictures with a faded, transparent edge (step 5.3d).

Called by make-globe-poster.mjs:
    python globe_poster.py <folder with light.png and dark.png> <output folder>

The globe itself stays fully opaque; the sky glow around it fades out towards the edge
of the square, so the picture sits on the page background without a visible box.
The globe's width is measured on the light photograph (the page background there is
one flat colour) and printed: Story.tsx needs it (POSTER.disc) to place the picture.
"""
import sys
from pathlib import Path

from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])

light = Image.open(src / "light.png").convert("RGB")
bg = light.getpixel((2, 2))
mid = light.height // 2
row = [
    x
    for x in range(light.width)
    if max(abs(a - b) for a, b in zip(light.getpixel((x, mid)), bg)) > 40
]
disc = row[-1] - row[0] + 1  # px, measured along the middle row
disc_over_side = disc / light.width
print(f"globe width {disc} px in a {light.width} px square: disc/side = {disc_over_side:.4f}")

for theme in ("light", "dark"):
    img = Image.open(src / f"{theme}.png").convert("RGB")
    side = img.width
    centre = (side - 1) / 2
    # Radius kept fully opaque: just outside the globe's edge.
    solid = side * disc_over_side / 2 * 1.04
    # Radius where the picture is fully transparent. A short fade: a long one shows rings.
    edge = solid + side * 0.07
    alpha = Image.new("L", img.size)
    px = alpha.load()
    for y in range(side):
        for x in range(side):
            r = ((x - centre) ** 2 + (y - centre) ** 2) ** 0.5
            k = 1.0 if r <= solid else max(0.0, 1.0 - (r - solid) / (edge - solid))
            px[x, y] = round(255 * k * k * (3 - 2 * k))  # smoothstep
    img.putalpha(alpha)
    target = out / f"globe-{theme}.webp"
    img.save(target, "WEBP", quality=90, alpha_quality=100, method=6)
    print(f"{target.name}: {target.stat().st_size / 1024:.1f} KB, {side} px")
