"""Match the Home helix's tone and colour to a reference picture (needs numpy and Pillow).

    python3 scripts/grade-helix.py reference.jpg helix-frames --box 200 0 560 920 --exclude 205 80 290 165

Histogram matching: the helix pixels in the reference (inside --box, minus any --exclude boxes) and in the
rendered frames are ranked by brightness, and each grey level of the frames is mapped to the brightness the
reference has at the same rank, so the darkest tenth of ours becomes the darkest tenth of theirs, and so on.
Each level then takes the reference's average colour at that brightness, which carries over its tint.
The tone curve's slope is limited (--max-slope, --min-slope) so it stays smooth.
The result is a 256-entry colour table, src/assets/helix/grade.json, that src/gl/helix.js applies as a
grade. The reference itself is only read, never stored.

"Helix pixels" means the same in both pictures: everything darker than --threshold, plus the bright pixels
right next to it (highlights on the metal), so the light backdrop is left out of both.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("reference")
ap.add_argument("frames", help="directory with the rendered frame-NN.png (from make-helix.py --frames)")
ap.add_argument("--box", type=int, nargs=4, metavar=("X0", "Y0", "X1", "Y1"), help="helix area in the reference")
ap.add_argument("--exclude", type=int, nargs=4, action="append", default=[], metavar=("X0", "Y0", "X1", "Y1"))
ap.add_argument("--threshold", type=float, default=0.85, help="pixels darker than this belong to the helix")
ap.add_argument("--grow", type=int, default=3, help="also count bright pixels this close to the helix")
ap.add_argument("--strength", type=float, default=1.0, help="0 keeps the render, 1 matches the reference")
ap.add_argument("--max-slope", type=float, default=2.2, help="steepest the tone curve may get (1 = unchanged)")
ap.add_argument("--min-slope", type=float, default=0.35, help="flattest the tone curve may get")
ap.add_argument("--shadows", type=float, default=0.0,
                help="deepen the darks after matching (0 = off): each level v becomes v^(1 + shadows * (1 - v)), "
                     "so blacks get deeper and highlights stay put")
args = ap.parse_args()


def luma(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def grow(mask, n):
    out = mask.copy()
    for _ in range(n):
        m = out.copy()
        m[1:] |= out[:-1]
        m[:-1] |= out[1:]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


# ---------------------------------------------------------------- reference
ref = np.asarray(Image.open(args.reference).convert("RGB")).astype(np.float32) / 255
region = np.zeros(ref.shape[:2], bool)
if args.box:
    x0, y0, x1, y1 = args.box
    region[y0:y1, x0:x1] = True
else:
    region[:] = True
for x0, y0, x1, y1 in args.exclude:
    region[y0:y1, x0:x1] = False
ref_l = luma(ref)
ref_mask = grow(ref_l < args.threshold, args.grow) & region
ref_px, ref_lum = ref[ref_mask], ref_l[ref_mask]

# ---------------------------------------------------------------- rendered frames (greyscale)
levels = np.zeros(256, np.float64)
for path in sorted(Path(args.frames).glob("frame-*.png"))[::6]:
    g = np.asarray(Image.open(path).convert("L"))
    mask = grow(g < args.threshold * 255, args.grow)
    levels += np.bincount(g[mask].ravel(), minlength=256)
cdf = np.cumsum(levels) / levels.sum()
mid_rank = cdf - levels / levels.sum() / 2  # each level sits in the middle of its share

# ---------------------------------------------------------------- match brightness, then colour
q = np.linspace(0, 1, 2001)
ref_q = np.quantile(ref_lum, q)
target = np.interp(mid_rank, q, ref_q)
# A large flat area in the render (one grey level) would otherwise make the curve jump there, which bands and
# amplifies compression noise. Limit the slope, then stretch the result back over the matched range.
lo, hi = target[0], target[-1]
slope = np.clip(np.diff(target) * 255, args.min_slope, args.max_slope)
target = np.concatenate([[0.0], np.cumsum(slope) / 255])
target = lo + (target - target[0]) * (hi - lo) / max(target[-1] - target[0], 1e-6)
if args.shadows:
    target = np.power(np.clip(target, 1e-6, 1), 1 + args.shadows * (1 - target))

bins = 48
edges = np.linspace(0, 1, bins + 1)
idx = np.clip(np.digitize(ref_lum, edges) - 1, 0, bins - 1)
ratio = np.ones((bins, 3))
filled = np.zeros(bins, bool)
for b in range(bins):
    sel = idx == b
    if sel.sum() >= 40:
        ratio[b] = ref_px[sel].mean(0) / max(ref_lum[sel].mean(), 1e-4)
        filled[b] = True
centres = (edges[:-1] + edges[1:]) / 2
for k in range(3):  # fill sparse bins from their neighbours
    ratio[:, k] = np.interp(centres, centres[filled], ratio[filled, k])

grey = np.arange(256) / 255
lut = np.stack([np.interp(target, centres, ratio[:, k]) * target for k in range(3)], 1)
lut = np.clip(grey[:, None] * (1 - args.strength) + lut * args.strength, 0, 1)
# light smoothing so neighbouring levels never jump
kernel = np.array([1, 2, 3, 2, 1], float) / 9
lut = np.stack([np.convolve(np.pad(lut[:, k], 2, mode="edge"), kernel, mode="valid") for k in range(3)], 1)

out = Path(__file__).resolve().parent.parent / "src" / "assets" / "helix" / "grade.json"
out.write_text(json.dumps({"lut": [[round(float(v), 4) for v in row] for row in lut]}) + "\n")
print(f"reference helix pixels {ref_mask.sum()}, mean {ref_lum.mean():.3f}; frames mean {np.dot(levels, grey) / levels.sum():.3f}")
for v in (0, 32, 64, 96, 128, 160, 192, 224, 240, 255):
    print(f"  grey {v:3d} -> rgb {tuple(round(float(x) * 255) for x in lut[v])}")
print("wrote", out)
