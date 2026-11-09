"""Model the glass DNA helix in Blender and render its rotation for the Home hero.

Runs headless with Blender's Python module (the bpy wheel needs Python 3.13):
    pip install bpy==5.2.3 numpy
    python scripts/make-helix.py --frames helix-frames --preview helix-preview.png
then encode the renders for the site (needs Pillow):
    python3 scripts/encode-helix.py helix-frames

Why renders and not a live material: the look is clear glass refracting a studio and itself, which only a path
tracer gets right.

How a handful of frames make an endless rotation: the helix is built with screw symmetry. Every rung is the same,
and the liquid surface repeats once per rung step, so turning it by one rung step (360 / rungs-per-turn degrees)
gives exactly the same shape as sliding it up by one rung spacing. The script renders N frames across that one
step; the page plays them in order and, each time it wraps around, shifts the picture by one rung spacing. Rungs
stay at their height and swing round, like a turning DNA model.

Each frame shows exactly one turn and is seamless top to bottom, so the page can tile it as tall as it needs:
  - the geometry is built a turn longer at each end, so the rendered turn never sees an end;
  - the voxel size divides the pitch, so the remesh grid lines up the same way a turn apart;
  - the surface noise is sampled in helical coordinates, so it has the same symmetry as the shape;
  - the light is a direction-only studio environment and the camera is orthographic, so shading does not
    change with height.

Pipeline: two rounded strands swept along a double helix + rounded rungs that swell into the strands
-> voxel remesh (one liquid body) -> smoothing -> gentle swell and ripples -> smoothing -> Cycles glass.
"""
import argparse
import json
import math
import random
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector, noise

ap = argparse.ArgumentParser()
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--pitch", type=float, default=5.8)
ap.add_argument("--radius", type=float, default=1.0)
ap.add_argument("--rungs-per-turn", type=int, default=14, help="even, so the shape repeats every half turn")
ap.add_argument("--rung-height", type=float, default=0.27)
ap.add_argument("--rung-depth", type=float, default=0.28)
ap.add_argument("--rung-shape", type=float, default=4.0, help="cross-section: 2 is round, higher is flatter-faced")
ap.add_argument("--voxel", type=float, default=0.0145, help="must divide the pitch")
ap.add_argument("--frames", help="directory for the rotation frames (frame-00.png ...)")
ap.add_argument("--count", type=int, default=12, help="frames across one rung step")
ap.add_argument("--check", action="store_true", help="also render the frame one full step on, to verify symmetry")
ap.add_argument("--width", type=int, default=1280, help="frame width in pixels")
ap.add_argument("--preview", help="perspective close-up for comparing against a reference (PNG)")
ap.add_argument("--samples", type=int, default=128)
ap.add_argument("--look", default="{}", help="JSON overrides for the studio and material (look development)")
ap.add_argument("--organic", action="store_true",
                help="a one-off molten sculpture: every rung and swell different (no screw symmetry, so --frames "
                     "rotation tiling does not apply; use --preview or --turn)")
ap.add_argument("--lean", type=float, default=0.0, help="--preview: tilt the helix in the picture plane (degrees)")
ap.add_argument("--sway", help="directory for sway frames: a close-up turning back and forth (use with --organic)")
ap.add_argument("--spin", help="directory for spin frames: the same close-up turning continuously (use with "
                               "--organic --symmetric); frames cover 180 degrees, which repeats")
ap.add_argument("--start", type=int, default=0, help="--spin: resume from this frame")
ap.add_argument("--symmetric", action="store_true",
                help="organic mode: make the two strands copies and every rung and swell symmetric under a half "
                     "turn, so the shape repeats every 180 degrees about its axis (needed for --spin)")
ap.add_argument("--sway-range", type=float, default=50.0, help="total turn covered by the sway frames (degrees)")
ap.add_argument("--sway-width", type=int, default=960, help="sway frame width in pixels (frames are 2:3)")
ap.add_argument("--depth-tilt", type=float, default=14.0, help="sway: top of the helix leans away (degrees)")
ap.add_argument("--sway-dist", type=float, default=10.5, help="sway: camera distance to the helix axis")
ap.add_argument("--strand-scale", type=float, default=1.0, help="thickness of the strands")
ap.add_argument("--fstop", type=float, default=0.0, help="--preview: depth of field at this f-stop (0 = off)")
args = ap.parse_args()

R, P, N_RUNGS = args.radius, args.pitch, args.rungs_per_turn
STEP = 2 * math.pi / N_RUNGS  # the screw symmetry: turn by STEP, slide by P / N_RUNGS
assert args.organic or abs(P / args.voxel - round(P / args.voxel)) < 1e-6, "voxel size must divide the pitch"
BG = 0.94  # sRGB of the flat backdrop behind the frames; the page keys it out (see src/gl/helix.js)
LOOK = {
    # studio (direction -> radiance) for the mercury, set up like a high-key chrome product shot: a dark room in
    # front of the helix (behind the camera) and a bright white cyc behind it, a big overhead softbox, dark floor.
    # Faces turned towards the camera mirror the dark room, so they go black; edges and tops catch the bright
    # studio, so they get white rims. That is the black-band, silver-rim look of the reference. A faint fill
    # behind the camera ("front") lifts the darks a little; the window ("softbox") and tall strips are off.
    "room": 0.05, "walls": 0.05, "cyc": 1.5, "top": 4.0, "front": 0.12, "strips": 0.0, "floor": 0.03,
    "softbox": 0.0,
    # soft light and dark bands across the dark room: a mirror turns them into the flowing streaks of liquid metal
    "bands": 0.9,
    "tint": [0.98, 0.99, 1.0],
    # glass
    # the helix: liquid mercury (a near-perfect, neutral mirror) or clear glass
    "material": "mercury", "metal_color": [0.8, 0.805, 0.815], "metal_rough": 0.012,
    # glass (the helix with "material": "glass")
    "ior": 1.5, "color": [0.95, 0.97, 1.0], "rough": 0.0,
    # light smoky absorption inside the glass: thick parts read darker than thin edges
    "absorb": 1.6, "absorb_color": [0.85, 0.865, 0.89],
}
LOOK.update(json.loads(args.look))

bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(args.seed)


def ss(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def step_noise(th, rad, seed):
    """noise along the strands that repeats every rung step, keeping the screw symmetry"""
    a = th * N_RUNGS
    return noise.noise(Vector((math.cos(a) * rad, math.sin(a) * rad, seed)))


def helix(th, phase):
    a = th + phase
    return Vector((R * math.cos(a), R * math.sin(a), P * th / (2 * math.pi) - P / 2))


def frame(th, phase):
    a = th + phase
    t = Vector((-R * math.sin(a), R * math.cos(a), P / (2 * math.pi))).normalized()
    n = Vector((math.cos(a), math.sin(a), 0.0))
    b = t.cross(n).normalized()
    n = b.cross(t).normalized()
    return t, n, b


def superellipse(phi, e):
    c, s = math.cos(phi), math.sin(phi)
    return math.copysign(abs(c) ** (2 / e), c), math.copysign(abs(s) ** (2 / e), s)


verts, faces = [], []


def add_tube(rings):
    k = len(rings[0])
    base = len(verts)
    for ring in rings:
        verts.extend(ring)
    for i in range(len(rings) - 1):
        for j in range(k):
            a = base + i * k + j
            faces.append((a, base + i * k + (j + 1) % k, base + (i + 1) * k + (j + 1) % k, base + (i + 1) * k + j))
    for idx, ring in ((0, rings[0]), (len(rings) - 1, rings[-1])):
        ci = len(verts)
        verts.append(sum(ring, Vector()) / k)
        start = base + idx * k
        for j in range(k):
            f = (start + j, start + (j + 1) % k, ci)
            faces.append(f if idx else f[::-1])


TH0, TH1 = -2 * math.pi, 4 * math.pi  # the rendered turn is theta 0..2pi, with a turn of geometry each side

# ---------------------------------------------------------------- strands: rounded tubes, beading gently per rung
K = 32
STRAND_W, STRAND_T = 0.46 * args.strand_scale, 0.38 * args.strand_scale
def free_noise(th, scale, seed):
    """noise along a strand with no repeat (organic mode)"""
    return noise.noise(Vector((th * scale * 0.5, seed, 0.37)))


# the two strands are copies (same noise) unless the organic model is free to differ
for phase, seed in ((0.0, 1.7), (math.pi, 9.3 if args.organic and not args.symmetric else 1.7)):
    rings = []
    samples = int((TH1 - TH0) / (2 * math.pi) * 216)
    for i in range(samples + 1):
        th = TH0 + (TH1 - TH0) * i / samples
        c = helix(th, phase)
        _, n, b = frame(th, phase)
        if args.organic:
            w = STRAND_W * (1 + 0.14 * free_noise(th, 1.3, seed) + 0.05 * free_noise(th, 3.1, seed + 2))
            h = STRAND_T * (1 + 0.1 * free_noise(th, 1.1, seed + 4))
            c = c + n * 0.045 * free_noise(th, 0.9, seed + 6) + b * 0.03 * free_noise(th, 1.7, seed + 8)
        else:
            w = STRAND_W * (1 + 0.02 * step_noise(th, 0.9, seed))
            h = STRAND_T * (1 + 0.015 * step_noise(th, 0.9, seed + 4))
            c = c + n * 0.006 * step_noise(th, 0.9, seed + 6)
        ring = []
        for j in range(K):
            x, y = superellipse(2 * math.pi * j / K, 2.2)
            ring.append(c + b * (w * 0.5 * x) + n * (h * 0.5 * y))
        rings.append(ring)
    add_tube(rings)

# ---------------------------------------------------------------- rungs: identical rounded bars that swell into the strands
assert args.organic or N_RUNGS % 2 == 0, "rungs per turn must be even for the half-turn symmetry"
RUNG = dict(rh=args.rung_height, rd=args.rung_depth, sag=0.015)
rr_ = random.Random(args.seed + 101)
for r in range(math.floor(TH0 / STEP), math.ceil(TH1 / STEP)):
    th = (r + 0.5) * STEP
    if th < TH0 + 0.3 or th > TH1 - 0.3:
        continue
    if args.organic:  # every rung its own: thickness, depth, sag, drift and a lopsided swell
        pr = dict(rh=RUNG["rh"] * rr_.uniform(0.8, 1.15), rd=RUNG["rd"] * rr_.uniform(0.85, 1.12),
                  sag=rr_.uniform(0.0, 0.06), drift=rr_.uniform(-0.04, 0.04), ph=rr_.uniform(0, 6.28),
                  lop=rr_.uniform(-0.12, 0.12), dz=rr_.uniform(-0.03, 0.03), k=rr_.uniform(1.3, 2.3))
    a, b = helix(th, 0.0), helix(th, math.pi)
    d = b - a
    length = d.length
    d.normalize()
    up = Vector((0, 0, 1))
    side = d.cross(up).normalized()
    rings = []
    steps = 64
    for i in range(steps + 1):
        u = i / steps
        c = a + d * (u * length)
        if args.organic:
            c.z -= pr["sag"] * math.sin(math.pi * u) - pr["dz"]
            flare = 1 + 0.75 * (1 - ss(0.04, 0.24, min(u, 1 - u)))
            if args.symmetric:
                # a half turn maps each rung onto itself end to end (u -> 1 - u, sideways -> opposite), so every
                # term is symmetric about the middle, and the sideways drift antisymmetric
                v = u - 0.5
                c += side * pr["drift"] * math.sin(2 * math.pi * 1.3 * v)
                wob = 1 + 0.1 * math.cos(2 * math.pi * pr["k"] * v)
                hh, dd = pr["rh"] * flare * wob, pr["rd"] * flare * (1 + 0.05 * math.cos(5 * v))
            else:
                c += side * pr["drift"] * math.sin(2 * math.pi * u * 1.3 + pr["ph"])
                wob = 1 + 0.1 * math.sin(2 * math.pi * u * 1.7 + pr["ph"]) + pr["lop"] * (u - 0.5) * 2
                hh, dd = pr["rh"] * flare * wob, pr["rd"] * flare * (1 + 0.05 * math.sin(5 * u + pr["ph"]))
            ring = []
            for j in range(24):
                x, y = superellipse(2 * math.pi * j / 24, args.rung_shape)
                ring.append(c + side * (dd * 0.5 * x) + up * (hh * 0.5 * y))
            rings.append(ring)
            continue
        c.z -= RUNG["sag"] * math.sin(math.pi * u)
        # every term is symmetric (or, for the sideways drift, antisymmetric) about the middle of the rung, so
        # turning the helix half a turn maps each rung onto itself
        c += side * 0.015 * math.sin(3 * math.pi * (u - 0.5))
        flare = 1 + 0.7 * (1 - ss(0.05, 0.22, min(u, 1 - u)))  # swells into the strands
        wob = 1 + 0.06 * math.cos(4 * math.pi * (u - 0.5)) + 0.02 * math.cos(10 * math.pi * (u - 0.5))
        hh, dd = RUNG["rh"] * flare * wob, RUNG["rd"] * flare
        ring = []
        for j in range(24):
            x, y = superellipse(2 * math.pi * j / 24, args.rung_shape)
            ring.append(c + side * (dd * 0.5 * x) + up * (hh * 0.5 * y))
        rings.append(ring)
    add_tube(rings)

mesh = bpy.data.meshes.new("helix_raw")
mesh.from_pydata([tuple(v) for v in verts], [], faces)
mesh.validate()
obj = bpy.data.objects.new("Helix", mesh)
bpy.context.collection.objects.link(obj)


def bake_modifiers(o):
    deps = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    o.modifiers.clear()
    old = o.data
    o.data = new
    bpy.data.meshes.remove(old)


def smooth(o, factor, iterations):
    m = o.modifiers.new("smooth", "SMOOTH")
    m.factor = factor
    m.iterations = iterations
    bake_modifiers(o)


m = obj.modifiers.new("remesh", "REMESH")
m.mode = "VOXEL"
m.voxel_size = args.voxel
m.adaptivity = 0.0
bake_modifiers(obj)
smooth(obj, 1.0, 36)  # a fine voxel grid needs more passes to smooth the same distance; a mirror shows every bump

# liquid swell and ripples along the normals, in helical coordinates so they share the screw symmetry:
# u = angle around the axis minus the helix phase at that height (unchanged by any screw motion),
# s = height in rung steps (shifts by exactly 1 per rung step)
me = obj.data
co = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
nr = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("normal", nr)
nr = nr.reshape(-1, 3)
disp = np.empty(len(co))
for i, (x, y, z) in enumerate(co):
    if args.organic:  # molten swell plus fine liquid ripples (contour-like rings from a sine of noise)
        if args.symmetric:
            # (x, y) through the complex square, (x^2 - y^2, 2xy) / 2: identical for a point and its half-turn
            # copy, smooth everywhere, and at the strands' radius it keeps the original feature size
            pv = Vector(((x * x - y * y) * 0.5, x * y, z))
        else:
            pv = Vector((x, y, z))
        swell = noise.noise(pv * 0.9 + Vector((3.1, 0, 0)))
        ripple = math.sin(noise.noise(pv * 1.4 + Vector((0, 8.7, 0))) * 14.0)
        disp[i] = 0.026 * swell + 0.0035 * ripple
        continue
    rr = math.hypot(x, y)
    u = 2 * (math.atan2(y, x) - 2 * math.pi * z / P)  # doubled: the two strands are copies of each other
    s = 2 * math.pi * z * N_RUNGS / P
    cu, su, cs, sn = math.cos(u), math.sin(u), math.cos(s), math.sin(s)
    swell = noise.noise(Vector((rr * 0.8 + cu * 0.8, su * 0.8 + cs * 0.3, sn * 0.3 + 3.1)))
    ripple = noise.noise(Vector((rr * 1.6 + cu * 1.4, su * 1.4 + cs * 0.5, sn * 0.5 + 8.7)))
    disp[i] = 0.008 * swell + 0.0012 * ripple
co += nr * disp[:, None]
me.vertices.foreach_set("co", co.ravel())
me.update()
smooth(obj, 0.6, 10)
for p in obj.data.polygons:
    p.use_smooth = True
print(f"helix: {len(obj.data.polygons)} faces")


# ---------------------------------------------------------------- studio + glass
def studio_image(o, W=2048, H=1024):
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    LON, LAT = np.meshgrid(-(u - 0.5) * 2 * np.pi, (v - 0.5) * np.pi)
    dx, dy, dz = np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)

    def S(a, b, x):
        t = np.clip((x - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)

    c = o["room"] * (0.6 + 0.8 * (dz * 0.5 + 0.5))
    c = c + (o["walls"] - c) * S(0.55, 0.85, np.abs(dx)) * S(0.6, 0.3, np.abs(dz))
    c = c + (o["cyc"] - c) * S(0.7, 0.95, dy)  # behind the helix (+y)
    c = c + o["top"] * S(0.45, 0.85, dz)
    c = c + o["front"] * S(0.3, 0.8, -dy) * S(0.75, 0.35, np.abs(dz))  # behind the camera (-y)
    # soft edges everywhere: a hard edge in the studio shows up as dashed marks through layers of glass
    band = S(-0.25, -0.45, dy) * S(0.75, 0.55, np.abs(dz))
    c = c + o["strips"] * (S(0.1, 0.05, np.abs(dx - 0.36)) + 0.7 * S(0.06, 0.025, np.abs(dx + 0.46))) * band
    c = c + o["softbox"] * S(0.32, 0.16, np.abs(dx + 0.42)) * S(0.42, 0.22, np.abs(dz - 0.18)) * S(-0.3, -0.6, dy)
    pattern = 0.55 * np.sin(LON * 7.0 + 0.4) + 0.3 * np.sin(LAT * 9.0 + LON * 2.0) + 0.15 * np.sin(LON * 17.0 - LAT * 4.0)
    c = c * (1 + o.get("bands", 0.0) * pattern * S(0.1, 0.5, -dy))
    c = c + (o["floor"] - c) * S(-0.06, -0.32, dz)
    t = LOOK["tint"]
    img = np.stack([c * t[0], c * t[1], c * t[2], np.ones_like(c)], -1).astype(np.float32)
    im = bpy.data.images.new("studio", W, H, float_buffer=True, alpha=True)
    im.pixels.foreach_set(img.ravel())
    return im


bg_lin = ((BG + 0.055) / 1.055) ** 2.4
world = bpy.data.worlds.new("studio")
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = studio_image(LOOK)
lp = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMixRGB")
mix.inputs["Color2"].default_value = (bg_lin, bg_lin, bg_lin, 1)  # what the camera sees directly: a flat backdrop
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
nt.links.new(env.outputs["Color"], mix.inputs["Color1"])
nt.links.new(mix.outputs["Color"], nt.nodes["Background"].inputs["Color"])
scene = bpy.context.scene
scene.world = world

glass = bpy.data.materials.new("glass")
glass.use_nodes = True
bsdf = glass.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (*LOOK["color"], 1)
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Transmission Weight"].default_value = 1.0
bsdf.inputs["Roughness"].default_value = LOOK["rough"]
bsdf.inputs["IOR"].default_value = LOOK["ior"]
if LOOK["absorb"] > 0:
    vol = glass.node_tree.nodes.new("ShaderNodeVolumeAbsorption")
    vol.inputs["Color"].default_value = (*LOOK["absorb_color"], 1)
    vol.inputs["Density"].default_value = LOOK["absorb"]
    glass.node_tree.links.new(vol.outputs[0], glass.node_tree.nodes["Material Output"].inputs["Volume"])
if LOOK["material"] == "hybrid":
    # liquid glass with a chrome skin: see-through and refracting, but with a strong mirror layer on top
    bsdf.inputs["Metallic"].default_value = LOOK.get("metal_mix", 0.35)
    obj.data.materials.append(glass)
elif LOOK["material"] == "mercury":
    mercury = bpy.data.materials.new("mercury")
    mercury.use_nodes = True
    mb = mercury.node_tree.nodes["Principled BSDF"]
    mb.inputs["Base Color"].default_value = (*LOOK["metal_color"], 1)
    mb.inputs["Metallic"].default_value = 1.0
    mb.inputs["Roughness"].default_value = LOOK["metal_rough"]
    obj.data.materials.append(mercury)
else:
    obj.data.materials.append(glass)

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 16
scene.cycles.transmission_bounces = 16
scene.cycles.glossy_bounces = 8
scene.cycles.transparent_max_bounces = 8
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.cycles.seed = 3  # same noise pattern in every frame, so the denoised frames do not shimmer
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam


def render(path):
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


OUTER = 2 * R + STRAND_W  # outer diameter of the helix
if args.preview:
    # perspective close-up, framed like a product shot, to compare with a reference
    cam.data.type = "PERSP"
    cam.data.lens = 50
    cam.data.sensor_fit = "VERTICAL"
    cam.location = (0, -7.6, 0.4)
    cam.rotation_euler = (math.radians(88), 0, 0)
    obj.rotation_mode = "YXZ"
    obj.rotation_euler = (0, math.radians(args.lean), 0.6)
    if args.fstop > 0:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = 7.4
        cam.data.dof.aperture_fstop = args.fstop
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    render(args.preview)
    obj.rotation_euler = (0, 0, 0)
    cam.data.dof.use_dof = False
    print("rendered", args.preview)

if args.frames:
    out = Path(args.frames)
    out.mkdir(parents=True, exist_ok=True)
    width_units = OUTER * 1.18  # a little air on both sides
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.ortho_scale = P / 2  # exactly half a turn, top to bottom: the shape repeats every half turn
    cam.location = (0, -12.0, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.resolution_x = args.width
    scene.render.resolution_y = round(args.width * (P / 2) / width_units)
    width_units = (P / 2) * args.width / scene.render.resolution_y  # exact, after rounding the height
    for i in range(args.count + (1 if args.check else 0)):
        obj.rotation_euler = (0, 0, STEP * i / args.count)
        render(str(out / f"frame-{i:02d}.png"))
        print("rendered", out / f"frame-{i:02d}.png", flush=True)
    meta = {
        "frames": args.count,
        "stepDegrees": round(math.degrees(STEP), 6),
        "rungsPerTurn": N_RUNGS,
        "tile": [round(width_units, 6), P / 2],
        "shiftPerStep": 2 / N_RUNGS,  # one rung spacing, as a fraction of the frame height
        "outer": round(OUTER, 6),
        "pixels": [scene.render.resolution_x, scene.render.resolution_y],
        "background": BG,
    }
    (out / "helix-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("meta", meta)

if args.sway:
    # Close-up product shot, like the reference: perspective, the top leaning away from the camera, shallow focus
    # on the middle, so the ends soften. The helix turns about its own axis from -range/2 to +range/2; the page
    # plays these frames back and forth. The frame shows about one pitch of helix top to bottom; the page fades
    # its top and bottom edges.
    out = Path(args.sway)
    out.mkdir(parents=True, exist_ok=True)
    lens, dist = 35.0, args.sway_dist
    cam.data.type = "PERSP"
    cam.data.lens = lens
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = 24.0
    cam.location = (0, -dist, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    if args.fstop > 0:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = dist - R * 0.6  # the front of the helix
        cam.data.dof.aperture_fstop = args.fstop
    scene.render.resolution_x = args.sway_width
    scene.render.resolution_y = round(args.sway_width * 1.5)
    frame_h = 2 * dist * (cam.data.sensor_height / 2) / lens  # height of the frame at the helix axis
    # spin about the helix's own axis first, then lean and tilt it (Blender applies ZYX as Z first): with the other
    # order the turn would happen about the tilted axis and the helix would wobble
    obj.rotation_mode = "ZYX"
    n = max(1, args.count)
    for i in range(n):
        turn = 0.0 if n == 1 else math.radians(args.sway_range) * (i / (n - 1) - 0.5)
        obj.rotation_euler = (math.radians(-args.depth_tilt), math.radians(args.lean), 0.6 + turn)
        render(str(out / f"frame-{i:02d}.png"))
        print("rendered", out / f"frame-{i:02d}.png", flush=True)
    meta = {
        "mode": "sway",
        "frames": n,
        "rangeDegrees": args.sway_range,
        "tile": [round(frame_h / 1.5, 6), round(frame_h, 6)],  # frame size in world units at the helix axis
        "outer": round(OUTER, 6),
        "pixels": [scene.render.resolution_x, scene.render.resolution_y],
        "background": BG,
    }
    (out / "helix-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("meta", meta)

if args.spin:
    # The same close-up as --sway, turning continuously. With --symmetric the shape repeats every half turn, so
    # frames cover 0..180 degrees (frame i at 180 i / count) and the page loops them. --check also renders the
    # frame at 180 degrees, which should match frame 0.
    assert args.symmetric, "--spin needs --symmetric (the frames cover half a turn)"
    out = Path(args.spin)
    out.mkdir(parents=True, exist_ok=True)
    lens, dist = 35.0, args.sway_dist
    cam.data.type = "PERSP"
    cam.data.lens = lens
    cam.data.sensor_fit = "VERTICAL"
    cam.data.sensor_height = 24.0
    cam.location = (0, -dist, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    if args.fstop > 0:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = dist - R * 0.6  # the front of the helix
        cam.data.dof.aperture_fstop = args.fstop
    scene.render.resolution_x = args.sway_width
    scene.render.resolution_y = round(args.sway_width * 1.5)
    frame_h = 2 * dist * (cam.data.sensor_height / 2) / lens
    obj.rotation_mode = "ZYX"
    n = max(1, args.count)
    start = args.start or 0
    for i in range(start, n + (1 if args.check else 0)):
        obj.rotation_euler = (math.radians(-args.depth_tilt), math.radians(args.lean), math.pi * i / n)
        render(str(out / f"frame-{i:02d}.png"))
        print("rendered", out / f"frame-{i:02d}.png", flush=True)
    meta = {
        "mode": "spin",
        "frames": n,
        "periodDegrees": 180,
        "tile": [round(frame_h / 1.5, 6), round(frame_h, 6)],
        "outer": round(OUTER, 6),
        "pixels": [scene.render.resolution_x, scene.render.resolution_y],
        "background": BG,
    }
    (out / "helix-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("meta", meta)

