"""Encode the Blender helix renders for the site (needs Pillow with WebP).

    python3 scripts/encode-helix.py helix-frames helix-drop.png

Reads helix-frames/frame-NN.png and helix-meta.json (from make-helix.py --frames) and writes src/assets/helix/:
  frame-NN.webp    full-size rotation frames for desktop
  m-frame-NN.webp  half-size frames for phones
  drop.webp        the glass droplet sprite
  meta.json        frame count, symmetry step and geometry, for src/gl/helix.js
The frames are stored as greyscale (the glass is neutral; the page adds the cool tint and colour fringes), which
keeps them small on the GPU: one byte per pixel.
"""
import argparse
import json
import shutil
from pathlib import Path

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("frames")
ap.add_argument("drop")
ap.add_argument("--quality", type=int, default=78)
args = ap.parse_args()

src = Path(args.frames)
meta = json.loads((src / "helix-meta.json").read_text())
out = Path(__file__).resolve().parent.parent / "src" / "assets" / "helix"
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)

total = {"desktop": 0, "mobile": 0}
for i in range(meta["frames"]):
    im = Image.open(src / f"frame-{i:02d}.png").convert("L")
    im.save(out / f"frame-{i:02d}.webp", "WEBP", quality=args.quality, method=6)
    half = im.resize((im.width // 2, round(im.height / 2)), Image.LANCZOS)
    half.save(out / f"m-frame-{i:02d}.webp", "WEBP", quality=args.quality, method=6)
    total["desktop"] += (out / f"frame-{i:02d}.webp").stat().st_size
    total["mobile"] += (out / f"m-frame-{i:02d}.webp").stat().st_size
    meta["mobilePixels"] = [half.width, half.height]

drop = Image.open(args.drop).convert("RGBA")
drop.save(out / "drop.webp", "WEBP", quality=90, alpha_quality=100, method=6)
(out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
print(f"{meta['frames']} frames: desktop {total['desktop'] / 1024:.0f} KB, phones {total['mobile'] / 1024:.0f} KB; "
      f"drop {(out / 'drop.webp').stat().st_size / 1024:.0f} KB")
