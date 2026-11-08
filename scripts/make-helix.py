"""Model the glass DNA helix in Blender and render it for the Home hero.

Runs headless with Blender's Python module (the bpy wheel needs Python 3.13):
    pip install bpy==5.2.3 numpy
    python scripts/make-helix.py --strip helix-strip.png --drop helix-drop.png --preview helix-preview.png
then encode the renders for the site (needs Pillow):
    python3 scripts/encode-helix.py helix-strip.png helix-drop.png

Why a render and not a live material: the look is clear glass refracting a studio and itself, which only a path
tracer gets right. The page still spins it: a helix turning about its axis looks exactly like a helix sliding
along that axis, so the site scrolls one seamless render (the "strip") to spin the helix.

That needs a seamless strip, so everything here is periodic along the axis with a period of TILE turns:
  - the geometry (strands, rungs and every random variation) repeats every TILE turns, and is built one turn
    longer at each end so the rendered middle never sees an end;
  - the voxel size divides the period, so the remesh grid lines up the same way at both ends of the tile;
  - the surface ripples are noise sampled through cos/sin of the height, so they repeat too;
  - the light is a direction-only studio environment and the camera is orthographic, so shading does not
    change with height.
The strip is the middle TILE turns, rendered on a transparent background.

Pipeline: two rounded strands swept along a double helix + rounded rungs that swell into the strands
-> voxel remesh (one liquid body) -> smoothing -> gentle periodic swell and ripples -> smoothing -> Cycles glass.
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
ap.add_argument("--tile-turns", type=int, default=2, help="period of the strip, in turns")
ap.add_argument("--pitch", type=float, default=5.8)
ap.add_argument("--radius", type=float, default=1.0)
ap.add_argument("--rungs-per-turn", type=int, default=18)
ap.add_argument("--voxel", type=float, default=0.02, help="must divide pitch * tile-turns")
ap.add_argument("--strip", help="render the seamless strip (PNG, RGBA)")
ap.add_argument("--strip-width", type=int, default=860)
ap.add_argument("--drop", help="render a glass droplet sprite (PNG, RGBA)")
ap.add_argument("--preview", help="perspective close-up for comparing against a reference (PNG)")
ap.add_argument("--samples", type=int, default=160)
ap.add_argument("--dispersion", action="store_true", help="render R, G and B with slightly different IOR")
ap.add_argument("--meta", default=str(Path(__file__).resolve().parent.parent / "src" / "assets" / "helix-meta.json"))
ap.add_argument("--look", default="{}", help="JSON overrides for the studio and material (look development)")
args = ap.parse_args()

R, P, TILE = args.radius, args.pitch, args.tile_turns
L = P * TILE  # length of one period along the axis
assert abs(L / args.voxel - round(L / args.voxel)) < 1e-6, "voxel size must divide the period"
LOOK = {
    # studio (direction -> radiance): a dark room, an overhead softbox, a soft fill behind the camera and a black
    # floor. Dark surroundings are what draw the dark lines inside clear glass. The optional tall strips add
    # sparkle but break up into dashed marks through the rungs, so they are off.
    "room": 0.01, "walls": 0.02, "cyc": 0.0, "top": 7.0, "front": 0.35, "strips": 0.0, "floor": 0.02,
    "tint": [0.98, 0.99, 1.0],
    # glass
    "ior": 1.5, "color": [0.95, 0.97, 1.0], "rough": 0.0,
    # light smoky absorption inside the glass: thick parts read darker than thin edges
    "absorb": 2.4, "absorb_color": [0.85, 0.865, 0.89],
    # the droplets sit in a bright studio of their own, so they read clear and light like the reference
    "drop": {"room": 0.75, "walls": 0.55, "cyc": 1.0, "top": 4.0, "front": 1.1, "strips": 4.0, "floor": 0.04},
}
LOOK.update(json.loads(args.look))

bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(args.seed)


def ss(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def pnoise(th, rad, seed):
    """noise that repeats every TILE turns of theta"""
    a = th / TILE
    return noise.noise(Vector((math.cos(a) * rad, math.sin(a) * rad, seed)))


def helix(th, phase):
    a = th + phase
    return Vector((R * math.cos(a), R * math.sin(a), P * th / (2 * math.pi) - L / 2))


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


TH0, TH1 = -2 * math.pi, 2 * math.pi * (TILE + 1)  # one extra turn beyond each end of the tile

# ---------------------------------------------------------------- strands: rounded, gently swelling tubes
K = 32
STRAND_W, STRAND_T = 0.46, 0.38
for phase, seed in ((0.0, 1.7), (math.pi, 9.3)):
    rings = []
    samples = int((TH1 - TH0) / (2 * math.pi) * 160)
    for i in range(samples + 1):
        th = TH0 + (TH1 - TH0) * i / samples
        c = helix(th, phase)
        _, n, b = frame(th, phase)
        swell = 1 + 0.09 * pnoise(th, 2.2, seed) + 0.04 * pnoise(th, 5.0, seed + 2)
        w = STRAND_W * swell
        h = STRAND_T * (1 + 0.08 * pnoise(th, 3.0, seed + 4))
        c = c + n * 0.03 * pnoise(th, 2.6, seed + 6)
        ring = []
        for j in range(K):
            x, y = superellipse(2 * math.pi * j / K, 2.2)
            ring.append(c + b * (w * 0.5 * x) + n * (h * 0.5 * y))
        rings.append(ring)
    add_tube(rings)

# ---------------------------------------------------------------- rungs: rounded bars that swell into the strands
per_tile = args.rungs_per_turn * TILE
params = [
    dict(rh=rng.uniform(0.17, 0.19), rd=rng.uniform(0.3, 0.34), sag=rng.uniform(0.0, 0.03), ph=rng.uniform(0, 6.28))
    for _ in range(per_tile)
]
first = math.floor(TH0 / (2 * math.pi) * args.rungs_per_turn)
last = math.ceil(TH1 / (2 * math.pi) * args.rungs_per_turn)
for r in range(first, last):
    th = (r + 0.5) * 2 * math.pi / args.rungs_per_turn
    if th < TH0 + 0.3 or th > TH1 - 0.3:
        continue
    pr = params[r % per_tile]
    a, b = helix(th, 0.0), helix(th, math.pi)
    d = b - a
    length = d.length
    d.normalize()
    up = Vector((0, 0, 1))
    side = d.cross(up).normalized()
    rings = []
    steps = 56
    for i in range(steps + 1):
        u = i / steps
        c = a + d * (u * length)
        c.z -= pr["sag"] * math.sin(math.pi * u)
        c += side * 0.02 * math.sin(2 * math.pi * u * 1.5 + pr["ph"])
        flare = 1 + 0.7 * (1 - ss(0.05, 0.22, min(u, 1 - u)))  # swells into the strands
        wob = 1 + 0.12 * math.sin(2 * math.pi * u * 2 + pr["ph"] * 1.7) + 0.06 * math.sin(2 * math.pi * u * 5 + pr["ph"])
        hh, dd = pr["rh"] * flare * wob, pr["rd"] * flare
        ring = []
        for j in range(24):
            x, y = superellipse(2 * math.pi * j / 24, 2.2)
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
smooth(obj, 1.0, 12)

# periodic liquid swell and ripples along the normals (height enters only through cos/sin, so it repeats)
me = obj.data
co = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
nr = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("normal", nr)
nr = nr.reshape(-1, 3)
disp = np.empty(len(co))
for i, (x, y, z) in enumerate(co):
    a = 2 * math.pi * z / L
    ca, sa = math.cos(a), math.sin(a)
    swell = noise.noise(Vector((x * 0.9 + ca * 1.6, y * 0.9 + sa * 1.6, 3.1)))
    ripple = noise.noise(Vector((x * 2.4 + ca * 5.0, y * 2.4 + sa * 5.0, 8.7)))
    disp[i] = 0.03 * swell + 0.008 * ripple
co += nr * disp[:, None]
me.vertices.foreach_set("co", co.ravel())
me.update()
smooth(obj, 0.6, 4)
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
    c = c + (o["floor"] - c) * S(-0.06, -0.32, dz)
    t = LOOK["tint"]
    img = np.stack([c * t[0], c * t[1], c * t[2], np.ones_like(c)], -1).astype(np.float32)
    im = bpy.data.images.new("studio", W, H, float_buffer=True, alpha=True)
    im.pixels.foreach_set(img.ravel())
    return im


world = bpy.data.worlds.new("studio")
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = studio_image(LOOK)
lp = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMixRGB")
mix.inputs["Color2"].default_value = (0.82, 0.83, 0.85, 1)  # what the camera sees behind (preview only)
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
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam


def render(path, transparent):
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    if not args.dispersion:
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return
    # dispersion: one render per channel with a slightly different index of refraction, then recombined
    chans = []
    for k, ior in enumerate((LOOK["ior"] - 0.025, LOOK["ior"], LOOK["ior"] + 0.035)):
        bsdf.inputs["IOR"].default_value = ior
        scene.render.filepath = f"{path}.c{k}.png"
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(scene.render.filepath)
        px = np.array(im.pixels[:], np.float32).reshape(im.size[1], im.size[0], 4)
        chans.append(px)
        bpy.data.images.remove(im)
        Path(scene.render.filepath).unlink()
    bsdf.inputs["IOR"].default_value = LOOK["ior"]
    out = chans[1].copy()
    out[..., 0], out[..., 2] = chans[0][..., 0], chans[2][..., 2]
    out[..., 3] = np.maximum.reduce([c[..., 3] for c in chans])
    im = bpy.data.images.new("combined", out.shape[1], out.shape[0], alpha=True)
    im.pixels.foreach_set(out.ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()


OUTER = 2 * R + STRAND_W  # outer diameter of the helix
if args.preview:
    # perspective close-up, framed like a product shot, to compare with a reference
    cam.data.type = "PERSP"
    cam.data.lens = 50
    cam.data.sensor_fit = "VERTICAL"
    cam.location = (0, -7.6, 0.4)
    cam.rotation_euler = (math.radians(88), 0, 0)
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    render(args.preview, transparent=False)
    print("rendered", args.preview)

if args.strip:
    width_units = OUTER * 1.18  # a little air on both sides
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.ortho_scale = L
    cam.location = (0, -12.0, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.resolution_x = args.strip_width
    scene.render.resolution_y = round(args.strip_width * L / width_units)
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    # ortho_scale applies to the vertical extent with a vertical sensor fit, so the width follows the aspect
    render(args.strip, transparent=True)
    meta = {
        "tile": [round(L * args.strip_width / scene.render.resolution_y, 5), L],
        "outer": round(OUTER, 5),
        "pitch": P,
        "turns": TILE,
        "pixels": [scene.render.resolution_x, scene.render.resolution_y],
    }
    Path(args.meta).parent.mkdir(parents=True, exist_ok=True)
    Path(args.meta).write_text(json.dumps(meta, indent=2) + "\n")
    print("rendered", args.strip, meta)

if args.drop:
    # a clear glass droplet on its own, reused as a sprite around the helix
    obj.hide_render = True
    env.image = studio_image({**LOOK, **LOOK["drop"]})
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=96, ring_count=48, location=(0, 0, 0))
    s = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    s.data.materials.append(glass)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.08
    cam.location = (0, -12.0, 0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.resolution_x = scene.render.resolution_y = 320
    render(args.drop, transparent=True)
    print("rendered", args.drop)
