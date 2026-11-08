"""Model the liquid-metal DNA helix in Blender and export it for the Home hero.

Runs headless with Blender's Python module (the bpy wheel needs Python 3.13):
    pip install bpy==5.2.3 numpy
    python scripts/make-helix.py --out src/gl/helix-data.js --preview-light helix-light.png --preview-dark helix-dark.png

Pipeline: two elliptical strands swept along a double helix + flat rungs (some broken in the middle)
+ drips -> voxel remesh (fuses everything into one liquid body) -> smoothing -> low-frequency noise
for poured, lumpy surfaces -> smoothing -> decimation -> quantised mesh written as a JS module.
Optional Cycles previews render the result as chrome in a light and a dark softbox studio.
"""
import argparse
import base64
import math
import random
import struct
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector, noise

ap = argparse.ArgumentParser()
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "src" / "gl" / "helix-data.js"))
ap.add_argument("--seed", type=int, default=11)
ap.add_argument("--turns", type=float, default=2.3)
ap.add_argument("--pitch", type=float, default=4.4)
ap.add_argument("--radius", type=float, default=1.0)
ap.add_argument("--voxel", type=float, default=0.02)
ap.add_argument("--target-tris", type=int, default=90000)
ap.add_argument("--preview-light")
ap.add_argument("--preview-dark")
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--res", type=int, default=1000, help="preview height in pixels")
args = ap.parse_args()

random.seed(args.seed)
R, P, TURNS = args.radius, args.pitch, args.turns
THETA_MAX = TURNS * 2 * math.pi
Z_SHIFT = P * TURNS / 2  # centre the helix on the origin

bpy.ops.wm.read_factory_settings(use_empty=True)


def helix(theta, phase):
    a = theta + phase
    return Vector((R * math.cos(a), R * math.sin(a), P * theta / (2 * math.pi) - Z_SHIFT))


def frame(theta, phase):
    a = theta + phase
    t = Vector((-R * math.sin(a), R * math.cos(a), P / (2 * math.pi))).normalized()
    n = Vector((math.cos(a), math.sin(a), 0.0))
    b = t.cross(n).normalized()
    n = b.cross(t).normalized()
    return t, n, b


def superellipse(phi, e=2.6):
    c, s = math.cos(phi), math.sin(phi)
    return math.copysign(abs(c) ** (2 / e), c), math.copysign(abs(s) ** (2 / e), s)


verts, faces = [], []


def add_tube(rings, close=True):
    """rings: list of lists of Vectors (same count each). Adds quads plus fan caps."""
    k = len(rings[0])
    base = len(verts)
    for ring in rings:
        verts.extend(ring)
    for i in range(len(rings) - 1):
        for j in range(k):
            a = base + i * k + j
            b = base + i * k + (j + 1) % k
            c = base + (i + 1) * k + (j + 1) % k
            d = base + (i + 1) * k + j
            faces.append((a, b, c, d))
    if close:
        for idx, ring in ((0, rings[0]), (len(rings) - 1, rings[-1])):
            centre = sum(ring, Vector()) / k
            ci = len(verts)
            verts.append(centre)
            start = base + idx * k
            for j in range(k):
                f = (start + j, start + (j + 1) % k, ci)
                faces.append(f if idx else f[::-1])


def taper(u, edge=0.06):
    """rounded ends: 0 at the tips, 1 in the middle"""
    if u < edge:
        x = u / edge
        return math.sqrt(max(0.0, 1 - (1 - x) ** 2))
    if u > 1 - edge:
        x = (1 - u) / edge
        return math.sqrt(max(0.0, 1 - (1 - x) ** 2))
    return 1.0


# ---------------------------------------------------------------- strands
K = 28
STRAND_W, STRAND_T = 0.58, 0.27
for phase, seed in ((0.0, 1.7), (math.pi, 9.3)):
    rings = []
    samples = int(TURNS * 120)
    for i in range(samples + 1):
        u = i / samples
        th = u * THETA_MAX
        c = helix(th, phase)
        t, n, b = frame(th, phase)
        wob = noise.noise(Vector((th * 0.9, seed, 0.0)))
        w = STRAND_W * (1 + 0.16 * wob) * taper(u, 0.012)
        h = STRAND_T * (1 + 0.22 * noise.noise(Vector((th * 1.4, seed, 3.0)))) * taper(u, 0.012)
        c = c + n * 0.05 * noise.noise(Vector((th * 0.6, seed, 7.0)))
        ring = []
        for j in range(K):
            x, y = superellipse(2 * math.pi * j / K)
            ring.append(c + b * (w * 0.5 * x) + n * (h * 0.5 * y))
        rings.append(ring)
    add_tube(rings)

# ---------------------------------------------------------------- rungs (+ drips)
drip_spots = []
rungs_per_turn = 10
count = int(TURNS * rungs_per_turn)
for r in range(count):
    th = (r + 0.5) / count * THETA_MAX
    if th < 0.25 or th > THETA_MAX - 0.25:
        continue
    a, b = helix(th, 0.0), helix(th, math.pi)
    d = b - a
    length = d.length
    d.normalize()
    up = Vector((0, 0, 1))
    side = d.cross(up).normalized()
    broken = random.random() < 0.26
    gap = random.uniform(0.1, 0.18) if broken else 0.0
    segments = [(0.0, 0.5 - gap / length / 2), (0.5 + gap / length / 2, 1.0)] if broken else [(0.0, 1.0)]
    rh = random.uniform(0.2, 0.26)  # vertical thickness
    rd = random.uniform(0.36, 0.46)  # depth
    sag = random.uniform(0.02, 0.08)
    ph = random.uniform(0, 6.28)
    for s0, s1 in segments:
        rings = []
        steps = 40
        for i in range(steps + 1):
            u = s0 + (s1 - s0) * i / steps
            tp = taper((u - s0) / (s1 - s0), 0.1 if broken else 0.04)
            c = a + d * (u * length)
            c.z -= sag * math.sin(math.pi * u)
            c += side * 0.035 * math.sin(2 * math.pi * u * 1.5 + ph)
            hh = rh * (0.85 + 0.3 * noise.noise(Vector((u * 3, r, 1.0)))) * tp
            dd = rd * (0.9 + 0.2 * noise.noise(Vector((u * 2, r, 5.0)))) * tp
            ring = []
            for j in range(20):
                x, y = superellipse(2 * math.pi * j / 20, 2.4)
                ring.append(c + side * (dd * 0.5 * x) + up * (hh * 0.5 * y))
            rings.append(ring)
        add_tube(rings)
    if random.random() < 0.38:
        u = random.uniform(0.28, 0.72)
        if not broken or abs(u - 0.5) > 0.12:
            c = a + d * (u * length)
            c.z -= sag * math.sin(math.pi * u) + rh * 0.35
            drip_spots.append((c, random.uniform(0.12, 0.36)))

# a few drips from the strands too
for _ in range(6):
    th = random.uniform(0.6, THETA_MAX - 0.6)
    phase = random.choice((0.0, math.pi))
    c = helix(th, phase)
    _, n, _ = frame(th, phase)
    c = c - Vector((0, 0, STRAND_T * 0.45)) + n * 0.05
    drip_spots.append((c, random.uniform(0.15, 0.32)))

mesh = bpy.data.meshes.new("helix_raw")
mesh.from_pydata([tuple(v) for v in verts], [], faces)
mesh.validate()
obj = bpy.data.objects.new("Helix", mesh)
bpy.context.collection.objects.link(obj)

# drips as small stacked ellipsoids, fused by the remesh
for c, L in drip_spots:
    steps = 6
    for i in range(steps):
        f = i / (steps - 1)
        rad = 0.05 * (1 - 0.55 * f) if i < steps - 1 else 0.048
        z = c.z - L * f
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        bmesh.ops.scale(bm, vec=Vector((rad, rad, rad * (1.6 if i < steps - 1 else 1.15))), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector((c.x, c.y, z)), verts=bm.verts)
        m = bpy.data.meshes.new("drip")
        bm.to_mesh(m)
        bm.free()
        o = bpy.data.objects.new("drip", m)
        bpy.context.collection.objects.link(o)

# join everything
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.context.collection.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()


def bake_modifiers(o):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(deps)
    new = bpy.data.meshes.new_from_object(ev)
    o.modifiers.clear()
    old = o.data
    o.data = new
    bpy.data.meshes.remove(old)


tex = bpy.data.textures.new("liquid", "CLOUDS")
tex.noise_scale = 0.32
tex.noise_depth = 2
tex2 = bpy.data.textures.new("ripple", "CLOUDS")
tex2.noise_scale = 0.11
tex2.noise_depth = 1

m = obj.modifiers.new("remesh", "REMESH")
m.mode = "VOXEL"
m.voxel_size = args.voxel
m.adaptivity = 0.0
m = obj.modifiers.new("smooth1", "SMOOTH")
m.factor = 1.0
m.iterations = 10
m = obj.modifiers.new("lumps", "DISPLACE")
m.texture = tex
m.texture_coords = "GLOBAL"
m.strength = 0.07
m.mid_level = 0.5
m = obj.modifiers.new("ripples", "DISPLACE")
m.texture = tex2
m.texture_coords = "GLOBAL"
m.strength = 0.006
m.mid_level = 0.5
m = obj.modifiers.new("smooth2", "SMOOTH")
m.factor = 0.9
m.iterations = 9
bake_modifiers(obj)
tris_now = sum(len(p.vertices) - 2 for p in obj.data.polygons)
ratio = min(1.0, args.target_tris / max(1, tris_now))
m = obj.modifiers.new("decimate", "DECIMATE")
m.decimate_type = "COLLAPSE"
m.ratio = ratio
m.use_collapse_triangulate = True
bake_modifiers(obj)
for p in obj.data.polygons:
    p.use_smooth = True
print(f"remeshed {tris_now} tris -> decimated to {sum(len(p.vertices) - 2 for p in obj.data.polygons)} tris")

# ---------------------------------------------------------------- export (Blender Z-up -> three.js Y-up)
me = obj.data
me.calc_loop_triangles()
n_v = len(me.vertices)
pos = np.empty((n_v, 3), np.float32)
nor = np.empty((n_v, 3), np.float32)
for i, v in enumerate(me.vertices):
    pos[i] = (v.co.x, v.co.z, -v.co.y)
    nor[i] = (v.normal.x, v.normal.z, -v.normal.y)
tris = np.array([t.vertices[:] for t in me.loop_triangles], np.uint32)
lo, hi = pos.min(axis=0), pos.max(axis=0)
q = np.round((pos - lo) / (hi - lo) * 65535 - 32768).astype(np.int16)
nq = np.round(np.clip(nor, -1, 1) * 127).astype(np.int8)
idx = tris.astype(np.uint16 if n_v < 65536 else np.uint32)
blob = q.tobytes() + nq.tobytes()
if len(blob) % 4:
    blob += b"\0" * (4 - len(blob) % 4)
blob += idx.tobytes()
b64 = base64.b64encode(blob).decode("ascii")
Path(args.out).write_text(
    "// Generated by scripts/make-helix.py (Blender). Do not edit by hand.\n"
    "// Layout: int16 positions (xyz, quantised to min/max), int8 normals, padding to 4 bytes, then indices.\n"
    f"export const HELIX = {{ vertices: {n_v}, triangles: {len(tris)}, index32: {str(n_v >= 65536).lower()}, "
    f"min: [{lo[0]:.5f}, {lo[1]:.5f}, {lo[2]:.5f}], max: [{hi[0]:.5f}, {hi[1]:.5f}, {hi[2]:.5f}], data: '{b64}' }};\n"
)
print(f"wrote {args.out}: {n_v} vertices, {len(tris)} triangles, {len(b64) / 1024:.0f} KB base64")


# ---------------------------------------------------------------- Cycles previews
def preview(path, dark):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    scene.render.resolution_y = args.res
    scene.render.resolution_x = int(args.res * 0.8)
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

    for o in [o for o in bpy.data.objects if o.name != "Helix"]:
        bpy.data.objects.remove(o)

    mat = bpy.data.materials.get("chrome") or bpy.data.materials.new("chrome")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.93, 0.94, 0.96, 1)
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.045
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    # spin so the middle rung crosses the frame, lean in the picture plane, tip the top away for depth of field
    obj.rotation_mode = "ZYX"
    centre_theta = THETA_MAX / 2
    obj.rotation_euler = (math.radians(16), math.radians(-14), -(centre_theta % math.pi))

    world = bpy.data.worlds.get("studio") or bpy.data.worlds.new("studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.005, 0.008, 1) if dark else (0.32, 0.33, 0.34, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world

    def panel(name, loc, rot, size, strength=None, black=False):
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
        p = bpy.context.active_object
        p.name = name
        p.scale = (size[0], size[1], 1)
        pm = bpy.data.materials.new(name)
        pm.use_nodes = True
        nt = pm.node_tree
        for nd in list(nt.nodes):
            nt.nodes.remove(nd)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        if black:
            sh = nt.nodes.new("ShaderNodeBsdfDiffuse")
            sh.inputs["Color"].default_value = (0.002, 0.002, 0.002, 1)
        else:
            sh = nt.nodes.new("ShaderNodeEmission")
            sh.inputs["Strength"].default_value = strength
        nt.links.new(sh.outputs[0], out.inputs[0])
        p.data.materials.append(pm)
        p.visible_camera = False
        return p

    # softboxes and black flags: the chrome look is entirely in what it reflects
    # behind the camera: a black wall with bright strips -> crisp black/white bands on the chrome
    panel("flagFront", (0.0, -20.0, 0.0), (math.radians(90), 0, 0), (40, 40), black=True)
    panel("stripL", (-3.2, -16.0, 0.0), (math.radians(90), 0, 0), (1.1, 22), 9.0)
    panel("stripR", (3.8, -16.0, 1.0), (math.radians(90), 0, math.radians(8)), (0.7, 22), 12.0)
    panel("stripTop", (0.0, -15.0, 7.5), (math.radians(60), 0, 0), (14, 1.6), 7.0)
    # sides and top
    panel("key", (-7.5, -4.0, 5.0), (math.radians(60), 0, math.radians(-55)), (6, 10), 6.0)
    panel("rim", (7.0, 2.0, 1.0), (math.radians(90), 0, math.radians(100)), (2.4, 18), 10.0)
    panel("top", (0, -2.0, 11.0), (0, 0, 0), (10, 6), 3.0)
    panel("flagL", (-9.0, 3.0, 0.0), (math.radians(90), 0, math.radians(-70)), (8, 24), black=True)
    # backdrop seen by the camera (light like the references, or dark like the site)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 9.0, 0), rotation=(math.radians(90), 0, 0))
    bd = bpy.context.active_object
    bd.scale = (40, 40, 1)
    bm_ = bpy.data.materials.new("backdrop")
    bm_.use_nodes = True
    bsdf_bd = bm_.node_tree.nodes["Principled BSDF"]
    bsdf_bd.inputs["Base Color"].default_value = (0.02, 0.022, 0.03, 1) if dark else (0.85, 0.86, 0.87, 1)
    bsdf_bd.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    bsdf_bd.inputs["Emission Strength"].default_value = 0.0 if dark else 0.55
    bd.data.materials.append(bm_)

    # floating glass droplets like the reference
    glass = bpy.data.materials.get("glass") or bpy.data.materials.new("glass")
    glass.use_nodes = True
    g = glass.node_tree.nodes["Principled BSDF"]
    g.inputs["Transmission Weight"].default_value = 1.0
    g.inputs["Roughness"].default_value = 0.0
    g.inputs["IOR"].default_value = 1.45
    for loc, rad in (((1.55, -1.2, 1.9), 0.3), ((-1.6, -0.8, -1.6), 0.24)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rad, location=loc, segments=48, ring_count=24)
        s = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        s.data.materials.append(glass)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam_data.sensor_fit = "VERTICAL"
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 12.5
    cam_data.dof.aperture_fstop = 1.6
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -12.5, 0.0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


if args.preview_light:
    preview(args.preview_light, dark=False)
if args.preview_dark:
    preview(args.preview_dark, dark=True)
