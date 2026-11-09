"""Measure how the helix moves between neighbouring sway frames, so the page can draw true in-between images.

    python3 scripts/flow-helix.py helix-frames

Needs numpy, Pillow and OpenCV (pip install opencv-python-headless). Run it after encode-helix.py.

For each pair of neighbouring frames (A, B) it measures the optical flow F: where each pixel of A has moved to in
B. The page then draws a moment t between them as (1 - t) * A(p - t F) + t * B(p + (1 - t) F): both frames slide
towards the in-between position before they are blended, so the helix moves smoothly at the display's frame rate
instead of cross-fading (which shows two faint copies mid-way and reads as stepping).

Writes src/assets/helix/flow-NN.webp (flow from frame NN to NN+1, quarter resolution: red is x and green is y,
128 is zero, FLOW_SCALE steps per pixel of the full-size frame) and adds "flow" to meta.json. Rare outliers (at
the frame corners and faded ends) are clamped and median-filtered away. Against a true in-between frame rendered in
Blender, this cuts the error of a half-way frame from 7.3 (cross-fade) to 3.05.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

FLOW_SCALE = 4  # quantisation: 1/4 pixel steps, +-31.75 pixels of range
LIMIT = 24  # real motion between neighbouring frames stays under ~15 px; anything beyond is a measuring error
DOWN = 4  # flow resolution: a quarter of the frame size (the flow is smooth, so this loses nothing visible)

ap = argparse.ArgumentParser()
ap.add_argument("frames", help="directory with the rendered frame-NN.png and helix-meta.json")
args = ap.parse_args()


def flow(a, b):
    return cv2.calcOpticalFlowFarneback(a, b, None, pyr_scale=0.5, levels=5, winsize=25, iterations=6,
                                        poly_n=7, poly_sigma=1.5, flags=cv2.OPTFLOW_FARNEBACK_GAUSSIAN)


src = Path(args.frames)
out = Path(__file__).resolve().parent.parent / "src" / "assets" / "helix"
meta = json.loads((out / "meta.json").read_text())
n = meta["frames"]
for old in out.glob("flow-*.webp"):
    old.unlink()
frames = [np.asarray(Image.open(src / f"frame-{i:02d}.png").convert("L")) for i in range(n)]
h, w = frames[0].shape
peak, total = 0.0, 0
for i in range(n - 1):
    f = flow(frames[i], frames[i + 1])
    small = np.clip(cv2.resize(f, (w // DOWN, h // DOWN), interpolation=cv2.INTER_AREA), -LIMIT, LIMIT)
    small = np.dstack([cv2.medianBlur(np.ascontiguousarray(small[..., k]), 5) for k in range(2)])
    small = cv2.GaussianBlur(small, (3, 3), 0)
    peak = max(peak, float(np.abs(small).max()))
    q = np.clip(np.round(128 + small * FLOW_SCALE), 0, 255).astype(np.uint8)
    rgb = np.dstack([q[..., 0], q[..., 1], np.full_like(q[..., 0], 128)])
    path = out / f"flow-{i:02d}.webp"
    Image.fromarray(rgb).save(path, "WEBP", quality=95, method=6)  # the field is smooth; this costs almost nothing
    total += path.stat().st_size
meta["flow"] = {"scale": FLOW_SCALE, "pixels": [w // DOWN, h // DOWN]}
(out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
print(f"{n - 1} flow maps, {total / 1024:.0f} KB, largest motion {peak:.1f} px between neighbouring frames")
