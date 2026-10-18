"""Renders the dartboard PWA icons (concentric palette rings) with Pillow."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "static/icons")
RINGS = [(30, "#FFC15E"), (20, "#F7934C"), (10, "#CC5803"), (3.5, "#1F1300")]


def render(size: int, maskable: bool, bg: str | None = None) -> Image.Image:
    scale = 4  # supersample for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Maskable icons keep content inside the 80% safe zone.
    unit = s / 64 * (0.78 if maskable else 1.0)
    c = s / 2
    for r, color in RINGS:
        d.ellipse([c - r * unit, c - r * unit, c + r * unit, c + r * unit], fill=color)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    render(size, False).save(OUT / f"icon-{size}.png")
    render(size, True, "#1F1300").save(OUT / f"maskable-{size}.png")
render(180, True, "#FFF8EE").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
