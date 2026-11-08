"""Encode the Blender helix renders for the site (needs Pillow with WebP).

    python3 scripts/encode-helix.py helix-strip.png helix-drop.png [--meta helix-meta.json]

Writes src/assets/helix-strip.webp and src/assets/helix-drop.webp. The strip keeps its full height
(it is one seamless period and the site wraps it vertically), with a lossy colour channel and lossless alpha.
"""
import argparse
import shutil
from pathlib import Path

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("strip")
ap.add_argument("drop")
ap.add_argument("--meta", help="copy this helix-meta.json next to the images")
ap.add_argument("--quality", type=int, default=88)
args = ap.parse_args()

out = Path(__file__).resolve().parent.parent / "src" / "assets"
out.mkdir(parents=True, exist_ok=True)
for src, name in ((args.strip, "helix-strip.webp"), (args.drop, "helix-drop.webp")):
    im = Image.open(src).convert("RGBA")
    im.save(out / name, "WEBP", quality=args.quality, alpha_quality=100, method=6)
    print(f"{name}: {im.size[0]}x{im.size[1]}, {(out / name).stat().st_size / 1024:.0f} KB")
if args.meta:
    shutil.copy(args.meta, out / "helix-meta.json")
