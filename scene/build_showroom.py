"""Builds the products page's showroom: a single-storey home hung with works
from the Zigguratss catalogue, walked through on scroll like the gallery.

Run: ZA_SCENE=showroom tools/blender-4.5.15-windows-x64/blender.exe -b --factory-startup -P scene/build_showroom.py [-- --web]

The plan follows how homes are zoned: a foyer at the front door opens onto
the public rooms, one light open space along the garden front (living room,
dining room, kitchen) behind floor-to-ceiling glass; a door from there leads
to the private side, a bedroom with its own bathroom. Furniture keeps the
usual clearances (45-50 cm sofa to coffee table, 90 cm behind dining chairs,
90 cm counters, a 120 cm kitchen aisle, 90 cm at the bed's foot).

    y 12 +---------------- glass ------------+---- window ----+
         |  LIVING ROOM        |  DINING     |     KITCHEN    |
    y  5 +---------+  open  +--+---door------+----------------+
         | (closed)|  FOYER |    BEDROOM       |  BATHROOM     |
    y  0 +---------+--door--+-----window-------+---window------+
        x 0       5.2      8.4               13.4             16

Blender coordinates: X east, Y north, Z up, metres. The rooms are lit live
on the website (src/components/showroom/Scene.jsx), not baked; the view
through the windows is a meadow under mountains (Poly Haven's alps_field),
written here as public/showroom/sky.webp.
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import tex  # noqa: E402
from lib.camera_path import to_three  # noqa: E402
from lib.geo import box, cylinder, disk, finish, link, material, rot_z  # noqa: E402
from lib.paths import ASSETS, BLEND, NAME, OUT, PROJECT, WEB_DATA, WEB_PUBLIC  # noqa: E402

assert NAME == "showroom", "run with ZA_SCENE=showroom"
random.seed(5)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

H = 2.9              # ceiling height
EXT = 0.25           # exterior walls (outside the plan's lines)
INT = 0.12           # interior walls (centred on them)
EYE = 1.55
FOV = 50             # vertical field of view, degrees (website)
W, D = 16.0, 12.0    # the plan
SPLIT = 5.0          # the wall between the garden rooms and the front ones
G = "home"           # one collection: nothing is baked

# ================================================================ materials
print("[home] materials")
T = tex
M = {}


def mk(name, maps, **kw):
    M[name] = material(f"sr_{name}", maps, **kw)
    return M[name]


def ws(name, *maps):
    return T.write_set(f"sr_{name}", *maps)


def marble(size, seed, base, cloud, vein, vein_w=0.03, warp=1.6):
    """A marble with clouded ground and branching veins, tiling seamlessly
    (the noise wraps, and the vein bands run at whole frequencies)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    turb = 0.6 * T.noise(rng, size, size, size / 7) + 0.3 * T.noise(rng, size, size, size / 22) \
        + 0.1 * T.noise(rng, size, size, size / 70)
    clouds = np.clip(0.5 + 0.35 * T.noise(rng, size, size, size / 10), 0, 1)[..., None]
    rgb = np.array(base, np.float32) * (1 - clouds) + np.array(cloud, np.float32) * clouds
    veins = np.zeros((size, size), np.float32)
    for f, g, a, w in ((2, 1, 1.0, vein_w), (4, 1, 0.55, vein_w * 0.6), (9, 4, 0.3, vein_w * 0.35)):
        band = np.abs(np.sin((xx * f + yy * g + turb * warp * a) * np.pi))
        veins = np.maximum(veins, a * np.clip(1 - band / w, 0, 1))
    rgb = rgb * (1 - veins[..., None]) + np.array(vein, np.float32) * veins[..., None]
    return T.lin_to_srgb(rgb)


# oak plank floors through the house, marble in the foyer, terrazzo in the bathroom
mk("oak_floor", ws("oak_floor", T.tinted_albedo("wood_floor", (1.0, 0.92, 0.8), sat=0.7, target=0.28),
                   T.roughness("wood_floor", 0.8, 0.05), T.normal("wood_floor")), normal_strength=0.4, web={"env": 0.5})
mk("marble_white", ws("marble_white", marble(1024, 4, (0.72, 0.71, 0.68), (0.6, 0.59, 0.57), (0.22, 0.21, 0.2), 0.018)),
   rough=0.2, web={"env": 0.7})
mk("marble_black", ws("marble_black", marble(1024, 3, (0.01, 0.01, 0.01), (0.03, 0.029, 0.028), (0.5, 0.49, 0.47), 0.02)),
   rough=0.22, web={"env": 0.7})
mk("onyx", ws("onyx", marble(1024, 8, (0.66, 0.5, 0.4), (0.36, 0.2, 0.13), (0.09, 0.045, 0.03), 0.07, 2.2)), rough=0.25,
   web={"env": 0.6})
mk("terrazzo", ws("terrazzo", T.tinted_albedo("terrazzo_tiles", (1.0, 0.96, 0.9), contrast=1.0, sat=0.3, target=0.4),
                  T.roughness("terrazzo_tiles", 0.7, 0.0), T.normal("terrazzo_tiles")), normal_strength=0.2, web={"env": 0.45})
mk("paving", ws("paving", T.tinted_albedo("smooth_concrete_floor", (0.95, 0.93, 0.88), contrast=1.0, sat=0.2, target=0.35),
                T.roughness("smooth_concrete_floor", 1.0, 0.0)), web={"env": 0.1})
# warm white walls, a deeper greige in the bedroom, white ceilings
mk("wall", ws("wall", T.tinted_albedo("clay_plaster", (1.0, 0.97, 0.92), contrast=0.25, sat=0.0, target=0.62),
              T.roughness("clay_plaster", 1.0, 0.1), T.normal("clay_plaster")), normal_strength=0.1, web={"env": 0.05})
mk("wall_greige", ws("wall_greige", T.tinted_albedo("clay_plaster", (1.0, 0.93, 0.84), contrast=0.3, sat=0.0, target=0.42),
                     T.roughness("clay_plaster", 1.0, 0.1), T.normal("clay_plaster")), normal_strength=0.15, web={"env": 0.05})
mk("ceiling", ws("ceiling", T.solid((0.78, 0.77, 0.75))), rough=0.95, web={"env": 0.0})
mk("skirting", None, color=(0.78, 0.77, 0.74), rough=0.4, web={"env": 0.2})
mk("travertine", ws("travertine", T.tinted_albedo("smooth_concrete_floor", (1.0, 0.97, 0.92), contrast=0.9, sat=0.3, target=0.45),
                    T.roughness("smooth_concrete_floor", 1.0, 0.1), T.normal("smooth_concrete_floor")), normal_strength=0.3,
   web={"env": 0.15})
mk("walnut", ws("walnut", T.tinted_albedo("american_walnut_veneer", (1.0, 0.88, 0.76), 1.0),
                T.roughness("american_walnut_veneer", 0.7, 0.0), T.normal("american_walnut_veneer")), normal_strength=0.3,
   web={"env": 0.35})
mk("walnut_dark", ws("walnut_dark", T.tinted_albedo("black_walnut_veneer_01", (0.8, 0.72, 0.64), 0.9),
                     T.roughness("black_walnut_veneer_01", 0.75, 0.0)), web={"env": 0.35})
mk("oak", ws("oak", T.tinted_albedo("oak_veneer_01", (1.0, 0.9, 0.76), 1.0),
             T.roughness("oak_veneer_01", 0.8, 0.1), T.normal("oak_veneer_01")), normal_strength=0.3, web={"env": 0.3})
# the kitchen's units: matt greige lacquer
mk("lacquer", None, color=(0.42, 0.4, 0.36), rough=0.55, web={"env": 0.3})
mk("linen", ws("linen", T.tinted_albedo("rough_linen", (1.0, 0.97, 0.92), sat=0.2, target=0.62),
               T.roughness("rough_linen", 1.0, 0.1), T.normal("rough_linen")), normal_strength=0.6, web={"env": 0.0})
mk("linen_sand", ws("linen_sand", T.tinted_albedo("rough_linen", (1.0, 0.9, 0.76), sat=0.2, target=0.32),
                    T.roughness("rough_linen", 1.0, 0.1), T.normal("rough_linen")), normal_strength=0.6, web={"env": 0.0})
mk("linen_dark", ws("linen_dark", T.tinted_albedo("rough_linen", (0.3, 0.26, 0.23), sat=0.2, target=0.04),
                    T.roughness("rough_linen", 1.0, 0.1), T.normal("rough_linen")), normal_strength=0.6, web={"env": 0.0})
mk("sheer", ws("sheer", T.tinted_albedo("rough_linen", (1.0, 0.98, 0.95), sat=0.0, contrast=0.4, target=0.72)),
   rough=1.0, web={"env": 0.0})
mk("boucle", ws("boucle", T.tinted_albedo("rough_linen", (1.0, 0.95, 0.86), contrast=0.6, sat=0.0, target=0.5),
                T.roughness("rough_linen", 1.0, 0.1), T.normal("rough_linen")), normal_strength=1.0, web={"env": 0.0})
mk("velvet_brown", ws("velvet_brown", T.tinted_albedo("velour_velvet", (0.5, 0.27, 0.15), sat=0.0, target=0.06),
                      T.roughness("velour_velvet", 1.0, 0.1), T.normal("velour_velvet")), normal_strength=0.5, web={"env": 0.05})
mk("velvet_olive", ws("velvet_olive", T.tinted_albedo("velour_velvet", (0.55, 0.62, 0.36), sat=0.0, target=0.07),
                      T.roughness("velour_velvet", 1.0, 0.1), T.normal("velour_velvet")), normal_strength=0.5, web={"env": 0.05})
mk("rug", ws("rug", T.tinted_albedo("poly_wool_herringbone", (1.0, 0.94, 0.84), contrast=0.7, sat=0.0, target=0.3),
             T.roughness("poly_wool_herringbone", 1.0, 0.1), T.normal("poly_wool_herringbone")), normal_strength=0.8,
   web={"env": 0.0})
mk("porcelain", None, color=(0.82, 0.8, 0.76), rough=0.12, web={"env": 0.8})
mk("black_matte", None, color=(0.012, 0.012, 0.012), rough=0.6, web={"env": 0.2})
mk("steel_black", None, color=(0.03, 0.03, 0.032), rough=0.32, metal=0.9, web={"env": 0.9})
mk("brass", None, color=(0.7, 0.48, 0.24), rough=0.3, metal=1.0, web={"env": 1.0})
mk("glass_black", None, color=(0.008, 0.009, 0.009), rough=0.05, web={"env": 1.0})
mk("mirror", None, color=(0.9, 0.9, 0.88), rough=0.03, metal=1.0, web={"env": 1.0})
mk("frame_black", None, color=(0.015, 0.014, 0.013), rough=0.5, web={"env": 0.3})
mk("plate", None, color=(0.78, 0.77, 0.74), rough=0.25, web={"env": 0.5})
# glass: barely there (exported see-through)
mk("glass", None, color=(0.85, 0.9, 0.9), rough=0.05, web={"env": 1.0})
# glowing: lampshades, the fire, LED strips and downlights
mk("lamp_shade", None, color=(0.95, 0.93, 0.9), rough=0.4, emission=(1.0, 0.82, 0.62), emission_strength=4.0,
   web={"env": 0.0, "emissive": True})
mk("fire", None, color=(1, 1, 1), rough=0.3, emission=(1.0, 0.45, 0.12), emission_strength=9.0,
   web={"env": 0.0, "emissive": True})
mk("emit_strip", None, color=(1, 1, 1), rough=0.3, emission=(1.0, 0.86, 0.7), emission_strength=8.0,
   web={"env": 0.0, "emissive": True})
mk("emit_lens", None, color=(1, 1, 1), rough=0.3, emission=(1.0, 0.86, 0.7), emission_strength=6.0,
   web={"env": 0.0, "emissive": True})


# ============================================================ helpers

def soft(name, mat, size, center, radius, angle=0.0, segments=4, tile=1.0, tilt=None):
    """A box with every edge rounded (cushions, mattresses, upholstery). `center`
    is its bottom centre; `tilt` (degrees about local X) leans it back."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((sx, sy, sz, 1)), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(radius, 0.49 * min(size)), segments=segments,
                    affect="EDGES", profile=0.5)
    m = Matrix.Translation(Vector(center) + Vector((0, 0, sz / 2))) @ rot_z(angle)
    if tilt:
        m = m @ Matrix.Rotation(math.radians(tilt), 4, "X")
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    for f in bm.faces:
        f.smooth = True
    return finish(bm, name, G, [mat], tile, angle)


def battens(name, mat, s0, s1, face, z0, z1, pitch=0.07, width=0.045, depth=0.03, axis="x", sign=-1):
    """Fluted joinery: slim vertical battens side by side from s0 to s1, their
    backs on a plane at `face` (y = face for axis x, x = face for axis y),
    standing out toward `sign`."""
    bm = bmesh.new()
    s = s0 + pitch / 2
    while s < s1 - pitch / 4:
        r = bmesh.ops.create_cube(bm, size=1.0)
        c = face + sign * depth / 2
        if axis == "x":
            m = Matrix.Translation((s, c, (z0 + z1) / 2)) @ Matrix.Diagonal((width, depth, z1 - z0, 1))
        else:
            m = Matrix.Translation((c, s, (z0 + z1) / 2)) @ Matrix.Diagonal((depth, width, z1 - z0, 1))
        bmesh.ops.transform(bm, matrix=m, verts=r["verts"])
        s += pitch
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > (z1 - z0) * 0.5],
                    offset=width * 0.3, segments=2, affect="EDGES", profile=0.5)
    return finish(bm, name, G, [mat], 1.2)


def lathe(name, mat, profile, matrix, seg=32):
    """A turned shape: profile is [(radius, z), ...] from the bottom up, both ends capped."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z))
                      for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            f = bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
            f.smooth = True
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(bm, name, G, [mat], 0.4)


_models = {}


def place(name, label, matrices):
    """A Poly Haven model at each of `matrices`, every copy sharing one mesh
    (so the website downloads it once)."""
    if name not in _models:
        d = os.path.join(ASSETS, "models", name)
        path = os.path.join(d, [f for f in os.listdir(d) if f.endswith(".gltf")][0])
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        datas = []
        for o in [o for o in bpy.data.objects if o not in before]:
            if o.type == "MESH":
                if o.data.shape_keys:
                    o.shape_key_clear()
                o.data.transform(o.matrix_world)
                o.data.uv_layers[0].name = "UVMap"
                datas.append(o.data)
            bpy.data.objects.remove(o)
        _models[name] = datas
    obs = []
    for i, m in enumerate(matrices):
        for j, data in enumerate(_models[name]):
            ob = bpy.data.objects.new(f"{label}{i}_{j}", data)
            bpy.context.scene.collection.objects.link(ob)
            ob.matrix_world = m
            link(ob, G)
            obs.append(ob)
    return obs


def at(x, y, z=0.0, facing=-90.0, scale=1.0):
    """A model's matrix: at (x, y, z), turned to face `facing` degrees (0 east,
    90 north); the models face -y (-90) as they come."""
    return Matrix.Translation((x, y, z)) @ rot_z(facing + 90) @ Matrix.Scale(scale, 4)


def wall(name, mat, p0, p1, t, openings=(), z1=H, side=0):
    """A straight wall from p0 to p1 (along X or Y), t thick: centred on the
    line, or wholly to its left (side 1). `openings` are (from, to along the
    wall, sill, head). White skirting at its foot."""
    (x0, y0), (x1, y1) = p0, p1
    along_x = abs(y1 - y0) < 1e-6
    length = abs(x1 - x0) if along_x else abs(y1 - y0)
    sgn = 1 if (x1 - x0 if along_x else y1 - y0) > 0 else -1
    off = side * t / 2

    def piece(s0, s1, z0, z2, m=mat, thick=t, tag=""):
        if s1 - s0 < 1e-4 or z2 - z0 < 1e-4:
            return
        mid = (s0 + s1) / 2
        if along_x:
            c, size = (x0 + sgn * mid, y0 + off * sgn, z0), (s1 - s0, thick, z2 - z0)
        else:
            c, size = (x0 - off * sgn, y0 + sgn * mid, z0), (thick, s1 - s0, z2 - z0)
        box(f"{name}{tag}_{s0:.2f}_{z0:.2f}", G, m, size, c, tile=2.0)

    s = 0.0
    floor_spans = []
    for a, b, sill, head in sorted(openings):
        piece(s, a, 0.0, z1)
        floor_spans.append((s, a))
        piece(a, b, 0.0, sill)
        if sill > 0:
            floor_spans.append((a, b))
        piece(a, b, head, z1)
        s = b
    piece(s, length, 0.0, z1)
    floor_spans.append((s, length))
    for a, b in floor_spans:
        piece(a, b, 0.0, 0.09, M["skirting"], t + 0.024, "_skirt")


def window(name, x0, x1, y, sill, head, mullions=1):
    """A black steel window frame and its glass in an exterior wall along X
    (y: the middle of the wall)."""
    fw = 0.05
    n = mullions + 1
    length = x1 - x0

    def bar(tag, s0, s1, z0, z1):
        box(f"{name}_{tag}", G, M["steel_black"], (s1 - s0, 0.06, z1 - z0), (x0 + (s0 + s1) / 2, y, z0))

    bar("sill", 0, length, sill, sill + fw)
    bar("head", 0, length, head - fw, head)
    for k in range(n + 1):
        s = min(max(k * length / n, fw / 2), length - fw / 2)
        bar(f"m{k}", s - fw / 2, s + fw / 2, sill, head)
    box(f"{name}_glass", G, M["glass"], (length, 0.01, head - sill), (x0 + length / 2, y, sill))


def curtain(name, mat, s0, s1, line, z0=0.04, z1=H - 0.06, pleat=0.16, depth=0.045):
    """A pleated curtain along X from s0 to s1, hanging from a rod, its
    pleats about y = line."""
    bm = bmesh.new()
    n = max(4, int((s1 - s0) / pleat * 6))
    cols = []
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        w = depth * math.sin(2 * math.pi * (s - s0) / pleat)
        cols.append([bm.verts.new((s, line + w, z)) for z in (z0, z1)])
    for a, b in zip(cols, cols[1:]):
        f = bm.faces.new((a[0], b[0], b[1], a[1]))
        f.smooth = True
    finish(bm, name, G, [mat], 0.8)
    cylinder(f"{name}_rod", G, M["steel_black"], 0.012, s1 - s0 + 0.2,
             Matrix.Translation((s0 - 0.1, line, z1 + 0.02)) @ Matrix.Rotation(math.radians(90), 4, "Y"), segments=8)


def local(origin, facing):
    """A frame at `origin` turned to `facing` degrees: local -y is the way it faces."""
    return Matrix.Translation(origin) @ rot_z(facing + 90)


def lbox(name, mat, F, size, c, facing=0.0, bevel=0.0, tile=1.0):
    """A box placed in a local frame F (c: its bottom centre in F)."""
    return box(name, G, mat, size, tuple(F @ Vector(c)), angle=facing + 90, tile=tile, bevel=bevel)


def lsoft(name, mat, F, size, c, radius, facing=0.0, tilt=None, segments=4, tile=1.0):
    return soft(name, mat, size, tuple(F @ Vector(c)), radius, angle=facing + 90, tilt=tilt, segments=segments, tile=tile)


def sofa(name, origin, facing, length=2.6, mat=None):
    """A low modern sofa: a deep seat, back cushions, slim arms."""
    mat = mat or M["linen_sand"]
    F = local(origin, facing)
    lsoft(f"{name}Base", mat, F, (length, 0.98, 0.42), (0, 0, 0.0), 0.05, facing, tile=0.6)
    seats = 3 if length > 2.2 else 2
    cw = (length - 0.36) / seats
    for i in range(seats):
        x = -length / 2 + 0.18 + cw * (i + 0.5)
        lsoft(f"{name}Seat{i}", mat, F, (cw - 0.02, 0.72, 0.14), (x, -0.08, 0.42), 0.06, facing, tile=0.6)
        lsoft(f"{name}Back{i}", mat, F, (cw - 0.02, 0.24, 0.42), (x, 0.32, 0.46), 0.09, facing, tilt=-10, tile=0.6)
    for sx in (-1, 1):
        lsoft(f"{name}Arm{sx}", mat, F, (0.18, 0.98, 0.62), (sx * (length / 2 - 0.09), 0, 0.0), 0.05, facing, tile=0.6)


def bottle(name, at_, height=0.3):
    r = 0.037
    return lathe(name, M["glass_black"], [(r, 0.0), (r, height * 0.62), (r * 0.8, height * 0.7),
                                         (0.013, height * 0.8), (0.013, height)], Matrix.Translation(at_), seg=16)


def downlight(name, x, y):
    disk(name, G, M["emit_lens"], 0.04, Matrix.Translation((x, y, H - 0.001)) @ Matrix.Rotation(math.pi, 4, "X"), 16)


# =============================================================== the shell
print("[home] shell")
FOYER = (5.2, 8.4)
BED = (8.4, 13.4)
BATH = (13.4, W)
DINING_X1 = 10.6
FRONT_DOOR = (6.3, 7.3)
GLAZING = (0.6, 10.4)        # the garden front's floor-to-ceiling glass
KITCHEN_WIN = (11.6, 15.2)
BED_WIN = (9.6, 12.4)
BATH_WIN = (14.0, 15.4)
FOYER_OPEN = (5.45, 8.15)
BED_DOOR = (10.2, 11.05)
BATH_DOOR = (3.8, 4.65)      # along y, in the wall at x 13.4
FW = FOYER[0] + INT / 2      # the foyer's west and east wall faces
FE = FOYER[1] - INT / 2
SW = SPLIT + INT / 2         # the split wall's north face (the garden rooms' south wall)

# floors: oak, with marble in the foyer and terrazzo in the bathroom
box("Floor", G, M["oak_floor"], (W + 0.5, D + 0.5, 0.1), (W / 2, D / 2, -0.1), tile=2.4)
box("FoyerFloor", G, M["marble_white"], (FE - FW, SPLIT - INT / 2, 0.004), ((FW + FE) / 2, (SPLIT - INT / 2) / 2, 0.0), tile=1.6)
box("BathFloor", G, M["terrazzo"], (BATH[1] - BATH[0] - INT / 2, SPLIT - INT / 2, 0.004),
    ((BATH[0] + INT / 2 + BATH[1]) / 2, (SPLIT - INT / 2) / 2, 0.0), tile=1.4)
box("Ceiling", G, M["ceiling"], (W + 0.5, D + 0.5, 0.12), (W / 2, D / 2, H), tile=3.0)
# the terrace outside the glass
box("Terrace", G, M["paving"], (12.0, 4.0, 0.1), (5.2, D + EXT + 2.0, -0.12), tile=1.2)
box("TerraceStep", G, M["paving"], (12.0, 0.4, 0.06), (5.2, D + EXT + 4.2, -0.22), tile=1.2)

# exterior walls (wholly outside the plan's lines), with their openings
wall("ExtN", M["wall"], (0, D), (W, D), EXT, [(GLAZING[0], GLAZING[1], 0.0, 2.6), (KITCHEN_WIN[0], KITCHEN_WIN[1], 1.05, 2.4)],
     side=1)
wall("ExtS", M["wall"], (W, 0), (0, 0), EXT, [(W - BED_WIN[1], W - BED_WIN[0], 0.45, 2.55), (W - BATH_WIN[1], W - BATH_WIN[0], 1.0, 2.0),
                                              (W - FRONT_DOOR[1], W - FRONT_DOOR[0], 0.0, 2.3)], side=1)
wall("ExtW", M["wall"], (0, 0), (0, D), EXT, side=1)
wall("ExtE", M["wall"], (W, D), (W, 0), EXT, side=1)
window("GardenGlass", GLAZING[0], GLAZING[1], D + EXT / 2, 0.0, 2.6, mullions=5)
window("KitchenWin", KITCHEN_WIN[0], KITCHEN_WIN[1], D + EXT / 2, 1.05, 2.4, mullions=2)
window("BedWin", BED_WIN[0], BED_WIN[1], -EXT / 2, 0.45, 2.55, mullions=1)
window("BathWin", BATH_WIN[0], BATH_WIN[1], -EXT / 2, 1.0, 2.0, mullions=1)

# interior walls; the doorways keep their doors slid away into the walls
wall("Split", M["wall"], (0, SPLIT), (W, SPLIT), INT, [(FOYER_OPEN[0], FOYER_OPEN[1], 0.0, 2.45), (BED_DOOR[0], BED_DOOR[1], 0.0, 2.2)])
wall("FoyerW", M["wall"], (FOYER[0], 0), (FOYER[0], SPLIT), INT)
wall("FoyerE", M["wall"], (FOYER[1], 0), (FOYER[1], SPLIT), INT)
wall("BedBath", M["wall"], (BATH[0], 0), (BATH[0], SPLIT), INT, [(BATH_DOOR[0], BATH_DOOR[1], 0.0, 2.2)])
# the bedroom's side walls a deeper greige (a thin skin over the white)
box("BedSkinE", G, M["wall_greige"], (0.006, SPLIT - INT, H - 0.09), (BED[1] - INT / 2 - 0.003, SPLIT / 2, 0.09), tile=2.0)
box("BedSkinW", G, M["wall_greige"], (0.006, SPLIT - INT, H - 0.09), (BED[0] + INT / 2 + 0.003, SPLIT / 2, 0.09), tile=2.0)


def door_frame(name, axis, a, b, line, head):
    """Architraves round a doorway, on both faces of its wall."""
    for side in (-1, 1):
        o = side * (INT / 2 + 0.01)
        if axis == "x":
            for x, dx in ((a, -0.035), (b, 0.035)):
                box(f"{name}_jamb{side}{x:.1f}", G, M["skirting"], (0.07, 0.02, head + 0.07), (x + dx, line + o, 0.0))
            box(f"{name}_head{side}", G, M["skirting"], (b - a + 0.14, 0.02, 0.07), ((a + b) / 2, line + o, head))
        else:
            for y, dy in ((a, -0.035), (b, 0.035)):
                box(f"{name}_jamb{side}{y:.1f}", G, M["skirting"], (0.02, 0.07, head + 0.07), (line + o, y + dy, 0.0))
            box(f"{name}_head{side}", G, M["skirting"], (0.02, b - a + 0.14, 0.07), (line + o, (a + b) / 2, head))


door_frame("BedDoor", "x", BED_DOOR[0], BED_DOOR[1], SPLIT, 2.2)
door_frame("BathDoor", "y", BATH_DOOR[0], BATH_DOOR[1], BATH[0], 2.2)


def door_leaf(door_id, hinge, along, width, axis):
    """An oak door leaf, shut in its doorway, a brass lever on both faces. The
    website swings it about its hinge (tagged `door`: path.json "doors")."""
    hx, hy = hinge
    cx, cy = (hx + along * width / 2, hy) if axis == "x" else (hx, hy + along * width / 2)
    size = (width, 0.04, 2.17) if axis == "x" else (0.04, width, 2.17)
    leaf = box(f"Door_{door_id}", G, M["oak"], size, (cx, cy, 0.01), tile=1.0, bevel=0.003)
    leaf["door"] = door_id
    lx, ly = (hx + along * (width - 0.07), hy) if axis == "x" else (hx, hy + along * (width - 0.07))
    for side in (-1, 1):
        ox, oy = (0, side * 0.045) if axis == "x" else (side * 0.045, 0)
        r = math.radians(90 if axis == "y" else 0)
        lever = cylinder(f"Door_{door_id}_lever{side}", G, M["brass"], 0.009, 0.13,
                         Matrix.Translation((lx + ox, ly + oy, 1.0)) @ Matrix.Rotation(r, 4, "Z")
                         @ Matrix.Rotation(math.radians(-90 * along), 4, "Y"), segments=10)
        lever["door"] = door_id


# the bedroom's door hangs on its east jamb and opens into the bedroom; the
# bathroom's on its north jamb, opening into the bathroom
door_leaf("bed", (BED_DOOR[1] - 0.01, SPLIT), -1, BED_DOOR[1] - BED_DOOR[0] - 0.02, "x")
door_leaf("bath", (BATH[0], BATH_DOOR[1] - 0.01), -1, BATH_DOOR[1] - BATH_DOOR[0] - 0.02, "y")
# the front door: walnut, a long brass pull
box("FrontDoor", G, M["walnut"], (FRONT_DOOR[1] - FRONT_DOOR[0], 0.06, 2.3), ((FRONT_DOOR[0] + FRONT_DOOR[1]) / 2, -0.1, 0.0), tile=1.0)
cylinder("FrontPull", G, M["brass"], 0.014, 1.0, Matrix.Translation((FRONT_DOOR[1] - 0.12, -0.05, 0.65)), segments=12)
for i, (x, y) in enumerate(((6.8, 1.4), (6.8, 3.6), (2.5, 8.5), (4.5, 6.5), (8.8, 7.3), (8.8, 10.0), (12.0, 7.0), (14.3, 7.0),
                            (12.0, 10.2), (14.3, 10.2), (10.4, 2.5), (12.6, 3.8), (14.7, 1.4), (14.7, 3.4))):
    downlight(f"Down{i}", x, y)

# ================================================================== foyer
# A console on the left wall under a work, a round brass mirror on the right
# with a bench below, a runner down the middle, a globe overhead.
print("[home] foyer")
box("Console", G, M["walnut_dark"], (0.36, 1.5, 0.05), (FW + 0.18, 2.6, 0.8), bevel=0.004)
for y in (1.95, 3.25):
    box(f"ConsoleLeg{y}", G, M["steel_black"], (0.3, 0.03, 0.8), (FW + 0.18, y, 0.0))
place("ceramic_vase_01", "ConsoleVase", [at(FW + 0.18, 3.05, 0.85, 0, 1.2)])
place("wooden_bowl_01", "ConsoleBowl", [at(FW + 0.18, 2.2, 0.85, 0, 0.9)])
cylinder("MirrorRim", G, M["brass"], 0.42, 0.03, Matrix.Translation((FE, 2.5, 1.6)) @ Matrix.Rotation(math.radians(-90), 4, "Y"), segments=48)
cylinder("Mirror", G, M["mirror"], 0.39, 0.032, Matrix.Translation((FE + 0.001, 2.5, 1.6)) @ Matrix.Rotation(math.radians(-90), 4, "Y"),
         segments=48)
soft("FoyerBench", M["boucle"], (0.4, 1.2, 0.44), (FE - 0.22, 2.5, 0.0), 0.05)
box("Runner", G, M["rug"], (1.1, 3.6, 0.01), (6.8, 2.3, 0.004), tile=0.8)
# (the globes hang clear of the eye line: the lamp's glass starts 0.22 above its origin)
place("modern_ceiling_lamp_01", "FoyerGlobe", [Matrix.Translation((6.8, 2.5, 2.25 - 0.22))])
place("potted_plant_01", "FoyerPlant", [at(FE - 0.35, 4.45, 0.0, -150, 1.1)])

# =========================================================== living room
# Seating round a travertine chimney breast with a linear fire and a large
# work above it, built-in walnut shelves either side; a sideboard with a work
# over it on the south wall; plants by the glass.
print("[home] living room")
CH_Y0, CH_Y1, CH_X = 7.1, 9.9, 0.42
box("Chimney", G, M["travertine"], (CH_X, CH_Y1 - CH_Y0, H), (CH_X / 2, (CH_Y0 + CH_Y1) / 2, 0.0), tile=1.4)
box("FireSlot", G, M["black_matte"], (0.02, 1.7, 0.32), (CH_X + 0.01, 8.5, 0.42))
box("Fire", G, M["fire"], (0.004, 1.6, 0.08), (CH_X + 0.022, 8.5, 0.46))
box("Hearth", G, M["travertine"], (0.3, CH_Y1 - CH_Y0, 0.18), (CH_X + 0.15, (CH_Y0 + CH_Y1) / 2, 0.0), tile=1.0)
for nm, (y0, y1) in (("S", (SW + 0.05, CH_Y0)), ("N", (CH_Y1, D - 0.6))):
    box(f"Shelf{nm}Back", G, M["walnut_dark"], (0.04, y1 - y0, H - 0.4), (0.02, (y0 + y1) / 2, 0.0))
    for side, dy in ((y0, 0.0175), (y1, -0.0175)):
        box(f"Shelf{nm}Side{side:.1f}", G, M["walnut_dark"], (0.36, 0.035, H - 0.4), (0.18, side + dy, 0.0))
    box(f"Shelf{nm}Base", G, M["walnut_dark"], (0.38, y1 - y0, 0.55), (0.19, (y0 + y1) / 2, 0.0))
    for z in (1.0, 1.5, 2.0):
        box(f"Shelf{nm}{z}", G, M["walnut_dark"], (0.36, y1 - y0, 0.03), (0.18, (y0 + y1) / 2, z))
    place("book_encyclopedia_set_01", f"Books{nm}", [at(0.2, y0 + 0.15, 1.03, 0, 1.0), at(0.2, (y0 + y1) / 2 + 0.1, 2.03, 0, 1.0)])
    place("ceramic_vase_03", f"ShelfVase{nm}", [at(0.18, y1 - 0.3, 1.53, 0, 0.9)])
    place("ceramic_vase_04", f"ShelfJug{nm}", [at(0.18, (y0 + y1) / 2, 0.58, 0, 1.0)])
    place("wooden_bowl_01", f"ShelfBowl{nm}", [at(0.18, y0 + 0.4, 1.53, 0, 0.7)])
# the seating: a sofa facing the fire, two lounge chairs across from each
# other, a marble coffee table 45 cm from the sofa, a wool rug under it all
SOFA_X = 4.35
box("LivingRug", G, M["rug"], (3.9, 3.8, 0.012), (2.75, 8.5, 0.0), tile=1.0)
sofa("Sofa", Vector((SOFA_X, 8.5, 0.012)), 180, 2.7)
for i, y in enumerate((7.95, 9.05)):
    lsoft(f"Cushion{i}", M["velvet_olive"] if i else M["velvet_brown"], local((SOFA_X + 0.2, y, 0.012), 180), (0.48, 0.15, 0.46),
          (0, 0, 0.55), 0.07, 180, tilt=-14)
place("coffee_table_round_01", "CoffeeTable", [at(2.95, 8.5, 0.012, 0, 0.82)])
place("mid_century_lounge_chair", "LoungeChair", [at(2.85, 6.65, 0.012, 80), at(2.85, 10.35, 0.012, -80)])
place("ceramic_vase_04", "TableVase", [at(3.1, 8.35, 0.42, 0, 0.7)])
# a side table and a reading lamp by the sofa, plants by the glass
cylinder("SideTable", G, M["travertine"], 0.24, 0.5, Matrix.Translation((SOFA_X + 0.05, 10.25, 0.0)), segments=32)
cylinder("FloorLampStem", G, M["brass"], 0.012, 1.55, Matrix.Translation((SOFA_X + 0.25, 6.85, 0.0)), segments=10)
cylinder("FloorLampBase", G, M["brass"], 0.16, 0.02, Matrix.Translation((SOFA_X + 0.25, 6.85, 0.0)), segments=24)
cylinder("FloorLampShade", G, M["lamp_shade"], 0.2, 0.28, Matrix.Translation((SOFA_X + 0.25, 6.85, 1.45)), segments=28, radius2=0.17)
place("potted_plant_02", "BigPlant", [at(6.6, 11.6, 0.0, -60, 1.2)])
place("potted_plant_01", "Tree", [at(0.9, 11.55, 0.0, 30, 1.25)])
# the sideboard on the south wall, its work above (west of the lounge chair,
# so the chair never stands between the walk and the work)
SIDEBOARD_X = 1.75
place("modern_wooden_cabinet", "Sideboard", [at(SIDEBOARD_X, SW + 0.27, 0.0, 90, 1.0)])
place("ceramic_vase_01", "SideboardVase", [at(0.95, SW + 0.27, 0.68, 0, 0.9)])
place("book_encyclopedia_set_01", "SideboardBooks", [at(2.25, SW + 0.25, 0.68, 0, 0.7)])
curtain("CurtainLivingW", M["sheer"], 0.15, 0.75, D - 0.18)
curtain("CurtainDiningE", M["sheer"], 10.3, 10.95, D - 0.18)

# ============================================================ dining room
# A walnut table for six on two trestles, upholstered chairs, two globe
# pendants over it; a work on the wall behind.
print("[home] dining room")
TX, TY = 8.8, 8.6
box("DiningTop", G, M["walnut"], (1.0, 2.3, 0.045), (TX, TY, 0.715), tile=1.2, bevel=0.004)
for y in (TY - 0.8, TY + 0.8):
    box(f"Trestle{y:.1f}", G, M["walnut"], (0.8, 0.07, 0.715), (TX, y, 0.0), tile=1.0)
box("TableRunner", G, M["linen_sand"], (0.36, 1.6, 0.004), (TX, TY, 0.76))
chairs = []
for y in (TY - 0.72, TY, TY + 0.72):
    chairs += [at(TX - 0.72, y, 0.0, 0), at(TX + 0.72, y, 0.0, 180)]
place("dining_chair_02", "DiningChair", chairs)
place("modern_ceiling_lamp_01", "DiningGlobe", [Matrix.Translation((TX, TY - 0.55, 1.72 - 0.22)),
                                                 Matrix.Translation((TX, TY + 0.55, 1.72 - 0.22))])
place("wooden_bowl_01", "DiningBowl", [at(TX, TY - 0.2, 0.765, 0, 1.0)])
place("ceramic_vase_03", "DiningVase", [at(TX, TY + 0.45, 0.765, 0, 0.8)])

# ================================================================ kitchen
# Tall units along the east wall (pantries, ovens, a walnut-fronted fridge),
# white marble counters along the wall and under the window, a fluted walnut
# island with a black marble top and the hob, three stools; globes over it.
print("[home] kitchen")
KE, KN = W, D      # the east and north walls' faces
BASE_D, TOP_Z = 0.62, 0.9
TALL = [(SW, 6.3, "pantry"), (6.3, 7.0, "oven"), (7.0, 7.9, "fridge"), (7.9, 8.7, "pantry")]
for i, (y0, y1, kind) in enumerate(TALL):
    box(f"Tall{i}", G, M["lacquer"], (BASE_D, y1 - y0 - 0.004, 2.35), (KE - BASE_D / 2, (y0 + y1) / 2, 0.1))
    if kind == "fridge":
        battens(f"Fridge{i}", M["walnut"], y0 + 0.01, y1 - 0.01, KE - BASE_D, 0.12, 2.43, axis="y", sign=-1)
    if kind == "oven":
        box(f"Oven{i}", G, M["glass_black"], (0.01, y1 - y0 - 0.08, 0.6), (KE - BASE_D - 0.005, (y0 + y1) / 2, 0.95))
        box(f"Oven{i}b", G, M["glass_black"], (0.01, y1 - y0 - 0.08, 0.45), (KE - BASE_D - 0.005, (y0 + y1) / 2, 1.62))
    else:
        box(f"TallPull{i}", G, M["steel_black"], (0.02, 0.02, 0.5), (KE - BASE_D - 0.01, y0 + 0.08 if i % 2 else y1 - 0.08, 0.9))
box("TallBulkhead", G, M["wall"], (BASE_D, 8.7 - SW, H - 2.45), (KE - BASE_D / 2, (SW + 8.7) / 2, 2.45))
box("TallPlinth", G, M["black_matte"], (BASE_D - 0.06, 8.7 - SW, 0.1), (KE - BASE_D / 2 + 0.03, (SW + 8.7) / 2, 0.0))
# the counters: an L along the east wall and the window
RUN_X0 = DINING_X1 + 0.6
runs = [("E", (KE - BASE_D / 2, (8.7 + KN) / 2), (BASE_D, KN - 8.7)),
        ("N", ((RUN_X0 + KE - BASE_D) / 2, KN - BASE_D / 2), (KE - BASE_D - RUN_X0, BASE_D))]
for nm, (cx, cy), (sx, sy) in runs:
    box(f"Base{nm}", G, M["lacquer"], (sx, sy, TOP_Z - 0.14), (cx, cy, 0.1))
    box(f"Plinth{nm}", G, M["black_matte"], (sx - (0.05 if nm == "N" else 0), sy - (0.05 if nm == "E" else 0), 0.1), (cx, cy, 0.0))
    box(f"Top{nm}", G, M["marble_white"], (sx + (0.02 if nm == "N" else 0), sy + (0.02 if nm == "E" else 0), 0.04), (cx, cy, TOP_Z - 0.04),
        bevel=0.003, tile=1.6)
    span = sx if nm == "N" else sy
    for k in range(1, int(span / 0.6)):
        s = (cx - sx / 2 if nm == "N" else cy - sy / 2) + 0.6 * k
        if nm == "N":
            box(f"Seam{nm}{k}", G, M["black_matte"], (0.004, 0.005, TOP_Z - 0.16), (s, cy - sy / 2 - 0.002, 0.11))
        else:
            box(f"Seam{nm}{k}", G, M["black_matte"], (0.005, 0.004, TOP_Z - 0.16), (cx - sx / 2 - 0.002, s, 0.11))
# marble splashback; open walnut shelves on the east wall
box("SplashN", G, M["marble_white"], (KE - RUN_X0, 0.02, 1.05 - TOP_Z), ((RUN_X0 + KE) / 2, KN - 0.01, TOP_Z), tile=1.6)
box("SplashE", G, M["marble_white"], (0.02, KN - 8.7, 1.5 - TOP_Z), (KE - 0.01, (8.7 + KN) / 2, TOP_Z), tile=1.6)
for z in (1.6, 2.05):
    box(f"OpenShelf{z}", G, M["walnut"], (0.3, KN - 8.7 - BASE_D - 0.2, 0.04), (KE - 0.15, (8.7 + KN - BASE_D) / 2, z))
    box(f"OpenShelfLed{z}", G, M["emit_strip"], (0.01, KN - 8.7 - BASE_D - 0.3, 0.004), (KE - 0.28, (8.7 + KN - BASE_D) / 2, z - 0.004))
for k in range(5):
    cylinder(f"OpenPlate{k}", G, M["plate"], 0.13, 0.016, Matrix.Translation((KE - 0.16, 9.3, 1.64 + k * 0.02)), segments=24)
place("ceramic_vase_01", "OpenVase", [at(KE - 0.15, 10.0, 1.64, 0, 0.8), at(KE - 0.15, 9.6, 2.09, 0, 0.6)])
place("ceramic_vase_03", "OpenVase2", [at(KE - 0.15, 10.4, 2.09, 0, 0.7)])
for k, y in enumerate((9.05, 9.2)):
    bottle(f"OilBottle{k}", (KE - 0.2, y, TOP_Z), 0.28)
# the sink under the window, its black tap; a bowl of fruit, a board, herbs
SINK_X = (KITCHEN_WIN[0] + KITCHEN_WIN[1]) / 2
box("Sink", G, M["black_matte"], (0.7, 0.42, 0.004), (SINK_X, KN - 0.33, TOP_Z + 0.001))
cylinder("TapStem", G, M["steel_black"], 0.014, 0.36, Matrix.Translation((SINK_X, KN - 0.08, TOP_Z)), segments=12)
cylinder("TapSpout", G, M["steel_black"], 0.011, 0.24,
         Matrix.Translation((SINK_X, KN - 0.08, TOP_Z + 0.35)) @ Matrix.Rotation(math.radians(90), 4, "X"), segments=12)
place("wooden_bowl_01", "FruitBowl", [at(12.1, KN - 0.3, TOP_Z, 0, 1.0)])
box("Board", G, M["oak"], (0.45, 0.3, 0.025), (14.6, KN - 0.3, TOP_Z), bevel=0.004)
place("potted_plant_04", "Herbs", [at(11.45, KN - 0.3, TOP_Z, 0, 1.0), at(15.0, KN - 0.3, TOP_Z, 0, 0.8)])
# the island: fluted walnut round a black core, a black marble top with the hob
IX0, IX1, IY0, IY1 = 11.9, 14.6, 7.9, 8.95
box("IslandTop", G, M["marble_black"], (IX1 - IX0, IY1 - IY0, 0.05), ((IX0 + IX1) / 2, (IY0 + IY1) / 2, TOP_Z - 0.05), tile=1.6, bevel=0.004)
CORE_Y0 = IY0 + 0.3     # (the top overhangs the stools' side by 30 cm)
box("IslandCore", G, M["black_matte"], (IX1 - IX0 - 0.1, IY1 - CORE_Y0 - 0.06, TOP_Z - 0.05), ((IX0 + IX1) / 2, (CORE_Y0 + IY1) / 2, 0.0))
battens("IslandFlutesS", M["walnut"], IX0 + 0.05, IX1 - 0.05, CORE_Y0 + 0.03, 0.06, TOP_Z - 0.05, sign=-1)
battens("IslandFlutesN", M["walnut"], IX0 + 0.05, IX1 - 0.05, IY1 - 0.03, 0.06, TOP_Z - 0.05, sign=1)
battens("IslandFlutesW", M["walnut"], CORE_Y0 + 0.03, IY1 - 0.03, IX0 + 0.05, 0.06, TOP_Z - 0.05, axis="y", sign=-1)
battens("IslandFlutesE", M["walnut"], CORE_Y0 + 0.03, IY1 - 0.03, IX1 - 0.05, 0.06, TOP_Z - 0.05, axis="y", sign=1)
box("Hob", G, M["glass_black"], (0.7, 0.5, 0.006), (13.75, (IY0 + IY1) / 2 + 0.1, TOP_Z))
place("bar_chair_round_01", "Stool", [at(x, IY0 - 0.22, 0.0, 90 + random.uniform(-12, 12), 0.92) for x in (12.35, 12.95, 13.55)])
place("modern_ceiling_lamp_01", "IslandGlobe", [Matrix.Translation((x, (IY0 + IY1) / 2, 1.8 - 0.22)) for x in (12.6, 13.9)])
# a slim console on the south wall under the kitchen's work
box("KitchenConsole", G, M["walnut_dark"], (1.5, 0.35, 0.04), (13.6, SW + 0.175, 0.86), bevel=0.003)
for x in (12.92, 14.28):
    box(f"KitchenConsoleLeg{x}", G, M["steel_black"], (0.03, 0.3, 0.86), (x, SW + 0.175, 0.0))
place("ceramic_vase_04", "KitchenConsoleJug", [at(13.05, SW + 0.17, 0.9, 0, 1.0)])
place("book_encyclopedia_set_01", "Cookbooks", [at(13.85, SW + 0.18, 0.9, 0, 0.55)])

# ================================================================ bedroom
# The bed against the east wall under a wide work, an upholstered headboard,
# walnut bedside tables with lamps; a fluted walnut wardrobe on the west
# wall; an armchair by the window, curtains drawn back; a bench at the foot.
print("[home] bedroom")
BE = BED[1] - INT / 2
BWALL = BED[0] + INT / 2
BED_Y = 2.0
lsoft("Headboard", M["linen_sand"], local((BE - 0.05, BED_Y, 0.0), 180), (2.5, 0.1, 1.25), (0, 0, 0.0), 0.04, 180, tile=0.7)
box("BedPlinth", G, M["black_matte"], (2.0, 1.75, 0.12), (BE - 0.1 - 1.0, BED_Y, 0.0))
box("BedFrame", G, M["walnut_dark"], (2.15, 1.95, 0.24), (BE - 0.1 - 1.075, BED_Y, 0.12), bevel=0.01)
soft("Mattress", M["linen"], (2.05, 1.85, 0.24), (BE - 0.1 - 1.03, BED_Y, 0.33), 0.05)
soft("Duvet", M["linen"], (1.4, 2.0, 0.08), (BE - 0.1 - 1.4, BED_Y, 0.53), 0.04)
soft("Throw", M["linen_dark"], (0.6, 2.06, 0.06), (BE - 0.1 - 1.8, BED_Y, 0.56), 0.03)
for i, y in enumerate((BED_Y - 0.45, BED_Y + 0.45)):
    lsoft(f"Pillow{i}", M["linen"], local((BE - 0.32, y, 0.0), 180), (0.78, 0.22, 0.42), (0, 0, 0.5), 0.1, 180, tilt=-18)
lsoft("PillowAccent", M["velvet_olive"], local((BE - 0.55, BED_Y, 0.0), 180), (0.5, 0.14, 0.32), (0, 0, 0.55), 0.06, 180, tilt=-14)
for i, y in enumerate((BED_Y - 1.35, BED_Y + 1.35)):
    box(f"Bedside{i}", G, M["walnut_dark"], (0.42, 0.5, 0.5), (BE - 0.25, y, 0.0), bevel=0.006)
    cylinder(f"LampFoot{i}", G, M["brass"], 0.05, 0.3, Matrix.Translation((BE - 0.25, y, 0.5)), segments=16)
    cylinder(f"LampShade{i}", G, M["lamp_shade"], 0.15, 0.22, Matrix.Translation((BE - 0.25, y, 0.78)), segments=24, radius2=0.13)
box("BedRug", G, M["rug"], (2.6, 3.0, 0.012), (BE - 1.6, BED_Y, 0.0), tile=1.0)
soft("BedBench", M["boucle"], (0.4, 1.3, 0.44), (BE - 2.55, BED_Y, 0.0), 0.05)
# the wardrobe: fluted walnut doors floor to just under the ceiling
WR_Y0, WR_Y1 = 1.3, 3.7
box("WardrobeBody", G, M["walnut_dark"], (0.6, WR_Y1 - WR_Y0, 2.5), (BWALL + 0.3, (WR_Y0 + WR_Y1) / 2, 0.0))
battens("WardrobeDoors", M["walnut"], WR_Y0 + 0.02, WR_Y1 - 0.02, BWALL + 0.6, 0.06, 2.46, axis="y", sign=1)
box("WardrobeHead", G, M["wall_greige"], (0.6, WR_Y1 - WR_Y0, H - 2.5), (BWALL + 0.3, (WR_Y0 + WR_Y1) / 2, 2.5))
# the armchair by the window, a little table and plant beside it
place("modern_arm_chair_01", "BedArmchair", [at(9.7, 0.8, 0.0, 60, 1.0)])
cylinder("BedSideTable", G, M["travertine"], 0.2, 0.48, Matrix.Translation((10.5, 0.5, 0.0)), segments=28)
place("potted_plant_04", "BedPlant", [at(10.5, 0.5, 0.48, 0, 1.0)])
curtain("CurtainBedW", M["linen_sand"], 9.0, 9.7, 0.2)
curtain("CurtainBedE", M["linen_sand"], 12.3, 13.0, 0.2)

# =============================================================== bathroom
# A freestanding tub under the window before a rose onyx wall, a floating
# walnut vanity with two basins under a long lit mirror, a wall-hung WC, a
# glass-screened shower in the far corner, a towel ladder.
print("[home] bathroom")
BW = BATH[0] + INT / 2
for nm, (x0, x1, z0, z1) in (("L", (BW, BATH_WIN[0], 0, H)), ("R", (BATH_WIN[1], W, 0, H)),
                              ("B", (BATH_WIN[0], BATH_WIN[1], 0, 1.0)), ("T", (BATH_WIN[0], BATH_WIN[1], 2.0, H))):
    box(f"Onyx{nm}", G, M["onyx"], (x1 - x0, 0.02, z1 - z0), ((x0 + x1) / 2, 0.01, z0), tile=2.4)
TUB = Vector((14.7, 0.62, 0.004))
outer = soft("Tub", M["porcelain"], (1.7, 0.82, 0.58), TUB, 0.32, segments=6)
inner = soft("TubHollow", M["porcelain"], (1.54, 0.66, 0.6), TUB + Vector((0, 0, 0.1)), 0.28, segments=6)
mod = outer.modifiers.new("hollow", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", inner
with bpy.context.temp_override(object=outer, active_object=outer):
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(inner)
cylinder("TubFiller", G, M["steel_black"], 0.014, 0.95, Matrix.Translation((TUB.x - 1.0, TUB.y + 0.1, 0.0)), segments=10)
cylinder("TubSpout", G, M["steel_black"], 0.011, 0.18,
         Matrix.Translation((TUB.x - 1.0, TUB.y + 0.1, 0.93)) @ Matrix.Rotation(math.radians(90), 4, "Y"), segments=10)
# the vanity on the east wall
VY0, VY1 = 1.65, 3.45
box("Vanity", G, M["walnut"], (0.5, VY1 - VY0, 0.42), (W - 0.25, (VY0 + VY1) / 2, 0.38), bevel=0.004)
box("VanityTop", G, M["marble_white"], (0.52, VY1 - VY0 + 0.02, 0.03), (W - 0.26, (VY0 + VY1) / 2, 0.8), tile=1.2)
for i, y in enumerate((VY0 + 0.45, VY1 - 0.45)):
    lathe(f"Basin{i}", M["porcelain"], [(0.12, 0.0), (0.2, 0.04), (0.21, 0.14), (0.19, 0.14), (0.1, 0.05)],
          Matrix.Translation((W - 0.27, y, 0.83)), seg=32)
    cylinder(f"BasinTap{i}", G, M["steel_black"], 0.01, 0.18,
             Matrix.Translation((W, y, 1.05)) @ Matrix.Rotation(math.radians(-90), 4, "Y"), segments=10)
box("VanityMirror", G, M["mirror"], (0.02, VY1 - VY0 - 0.1, 0.85), (W - 0.03, (VY0 + VY1) / 2, 1.2))
box("VanityMirrorGlow", G, M["emit_strip"], (0.01, VY1 - VY0 - 0.14, 0.01), (W - 0.05, (VY0 + VY1) / 2, 2.05))
place("potted_plant_04", "BathPlant", [at(W - 0.27, (VY0 + VY1) / 2, 0.83, 0, 1.0)])
# the WC, wall-hung on the west wall
WC_Y = 2.4
box("WcPlate", G, M["porcelain"], (0.02, 0.24, 0.16), (BW + 0.01, WC_Y, 1.0))
lsoft("Wc", M["porcelain"], local((BW + 0.29, WC_Y, 0.0), 0), (0.38, 0.56, 0.26), (0, 0, 0.16), 0.12, 0, segments=5)
# the shower in the north-east corner: a stone tray, a glass screen, a rain head
SH_X0, SH_Y0, SH_Y1 = 14.75, 3.85, SPLIT - INT / 2
box("ShowerTray", G, M["terrazzo"], (W - SH_X0, SH_Y1 - SH_Y0, 0.02), ((SH_X0 + W) / 2, (SH_Y0 + SH_Y1) / 2, 0.004))
box("ShowerGlass", G, M["glass"], (0.01, SH_Y1 - SH_Y0, 2.0), (SH_X0, (SH_Y0 + SH_Y1) / 2, 0.02))
box("ShowerGlassEdge", G, M["steel_black"], (0.03, 0.03, 2.0), (SH_X0, SH_Y0, 0.02))
cylinder("ShowerRod", G, M["steel_black"], 0.01, H - 2.2, Matrix.Translation((15.4, 4.45, 2.2)), segments=8)
cylinder("ShowerHead", G, M["steel_black"], 0.16, 0.015, Matrix.Translation((15.4, 4.45, 2.19)), segments=32)
# a walnut towel ladder in the corner past the tub, a towel over it
for x in (15.7, 15.95):
    box(f"Ladder{x}", G, M["walnut"], (0.03, 0.03, 1.6), (x, 0.12, 0.0))
for k, z in enumerate((0.5, 0.9, 1.3)):
    box(f"LadderRung{k}", G, M["walnut"], (0.28, 0.025, 0.025), (15.825, 0.12, z))
soft("Towel", M["linen"], (0.3, 0.06, 0.55), (15.825, 0.17, 0.82), 0.02)

# ================================================================== works
# Each frame shows a work from the Zigguratss catalogue, chosen for its
# proportions; its eye icon on the website opens the work's details.
print("[home] works")
with open(os.path.join(PROJECT, "src", "components", "gallery", "data", "catalogue.json"), encoding="utf8") as f:
    CATALOGUE = json.load(f)
# (slot, room, (x, y) on the wall's face, which way the work faces, centre z, width, height, frame)
SLOTS = [
    ("entrance", "Entrance", (FW, 2.6), 0, 1.62, 0.9, 1.2, "walnut"),
    ("living", "Living room", (CH_X, 8.5), 0, 1.78, 1.6, 1.05, "black"),
    ("sideboard", "Living room", (SIDEBOARD_X, SW), 90, 1.48, 1.5, 0.95, "walnut"),
    ("dining", "Dining room", (9.1, SW), 90, 1.58, 1.2, 0.9, "black"),
    ("kitchen", "Kitchen", (13.6, SW), 90, 1.6, 0.85, 1.1, "black"),
    ("bedroom", "Bedroom", (BE, BED_Y), 180, 1.92, 1.5, 0.82, "walnut"),
    ("bath", "Bathroom", (BW, WC_Y), 0, 1.65, 0.62, 0.82, "black"),
]
used = set()


def choose(aspect):
    """The catalogue's closest work in proportion not hung yet."""
    best = min((w for w in CATALOGUE if w["id"] not in used), key=lambda w: abs(math.log(w["aspect"] / aspect)))
    used.add(best["id"])
    return best


FRAME_MAT = {"black": M["frame_black"], "walnut": M["walnut_dark"]}
products = []
for slot, room, (x, y), facing, zc, Wd, Ht, frame in SLOTS:
    work = choose(Wd / Ht)
    F = local((x, y, 0.0), facing)
    fw, depth = 0.025 + 0.01 * max(Wd, Ht), 0.045
    z0 = zc - Ht / 2
    for k, (size, c) in enumerate((((Wd, depth, fw), (0, -depth / 2, z0)), ((Wd, depth, fw), (0, -depth / 2, z0 + Ht - fw)),
                                   ((fw, depth, Ht - 2 * fw), (-Wd / 2 + fw / 2, -depth / 2, z0 + fw)),
                                   ((fw, depth, Ht - 2 * fw), (Wd / 2 - fw / 2, -depth / 2, z0 + fw)))):
        lbox(f"{slot}_frame{k}", FRAME_MAT[frame], F, size, c, facing, tile=0.4)
    aw, ah = Wd - 2 * fw - 0.02, Ht - 2 * fw - 0.02
    img = bpy.data.images.load(os.path.join(PROJECT, "public", work["image"].lstrip("/")))
    mat = material(f"art_{slot}", None, rough=0.8, web={"env": 0.05, "work": work["id"]})
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
    nt.links.new(t.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    canvas = lbox(f"Art_{slot}", mat, F, (aw, 0.03, ah), (0, -0.03, z0 + fw + 0.01), facing)
    # the image fills the canvas, cropped evenly to its proportions (cover)
    r = work["aspect"] / (aw / ah)
    su, sv = (1 / r, 1.0) if r > 1 else (1.0, r)
    inv = F.inverted()
    uvl = canvas.data.uv_layers["UVMap"]
    for poly in canvas.data.polygons:
        for li in poly.loop_indices:
            p = inv @ canvas.data.vertices[canvas.data.loops[li].vertex_index].co
            u = min(1, max(0, (p.x + aw / 2) / aw))
            v = min(1, max(0, (p.z - (z0 + fw + 0.01)) / ah))
            uvl.data[li].uv = ((1 - su) / 2 + u * su, (1 - sv) / 2 + v * sv)
    products.append({"id": slot, "room": room, "work": work, "eye": tuple(F @ Vector((Wd / 2 - 0.14, -0.08, zc + Ht / 2 - 0.14))),
                     "centre": tuple(F @ Vector((0, 0, zc)))})

for mat in bpy.data.materials:
    if "web" not in mat:
        mat["web"] = {"env": 0.3}
# (the glass is exported see-through)
M["glass"].surface_render_method = "BLENDED"
M["glass"].node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.1

# ================================================================ the view
# The meadow and mountains through the windows, for the website as a plain
# equirectangular image: the daylight eased softly into display values.
print("[home] view")
sky = bpy.data.images.load(os.path.join(ASSETS, "hdri", "alps_field_4k.hdr"))
sw_, sh_ = sky.size
px = np.empty(sw_ * sh_ * 4, np.float32)
sky.pixels.foreach_get(px)
lin = px.reshape(sh_, sw_, 4)[..., :3]
os.makedirs(WEB_PUBLIC, exist_ok=True)
T.save(T.lin_to_srgb(1.0 - np.exp(-lin * 1.5)), os.path.join(WEB_PUBLIC, "sky.webp"), "WEBP")
bpy.data.images.remove(sky)

# ============================================================ camera path
print("[home] camera path")
STEPS = [
    # the foyer: the house opens ahead onto the garden; then the foyer's work
    (0.00, ((6.8, 0.75, EYE), (6.8, D, 1.4)), []),
    (0.07, ((7.6, 1.6, EYE), (FW, 2.6, 1.5)), ["entrance"]),
    # into the living room: the fire and its work, then the room from the glass
    (0.07, ((6.8, 4.5, EYE), (2.5, 9.5, 1.35)), []),
    (0.07, ((6.7, 7.4, EYE), (CH_X, 8.5, 1.5)), ["living"]),
    # (round the end of the sofa, along the glass)
    (0.04, ((5.6, 11.0, EYE), (2.0, 8.0, 1.35)), []),
    (0.06, ((2.0, 11.35, EYE), (SIDEBOARD_X, SPLIT, 1.35)), ["sideboard"]),
    # along the glass to the dining room, its work behind the table (seen past
    # the pendants, from the kitchen's side)
    (0.08, ((10.2, 10.6, EYE), (9.1, SPLIT, 1.35)), ["dining"]),
    # the kitchen from the dining room, then its work from the window side
    (0.07, ((10.3, 9.7, EYE), (W, 8.6, 1.25)), []),
    (0.07, ((11.9, 10.5, EYE), (13.6, SPLIT, 1.4)), ["kitchen"]),
    # through the door to the bedroom
    (0.07, ((10.62, 6.3, EYE), (10.62, 2.5, 1.4)), []),
    (0.06, ((10.62, 4.3, EYE), (BE, 1.9, 1.35)), []),
    # (south of where the open bedroom door's edge stands, on the way out)
    (0.06, ((9.45, 3.75, EYE), (BE, BED_Y, 1.45)), ["bedroom"]),
    # into the bathroom
    # (through the doorway, looking in toward the vanity and the tub)
    (0.07, ((13.75, 4.25, EYE), (15.8, 2.4, 1.25)), []),
    (0.07, ((14.25, 4.35, EYE), (14.4, 0.0, 1.35)), ["bath"]),
]
times = []
for step, *_ in STEPS:
    times.append(round((times[-1] if times else 0.0) + step, 4))
WALK = times[-1]


def P(t):
    return round(t / WALK, 4)


keys = [{"p": P(t), "pos": view[0], "target": view[1]} for t, (_, view, _w) in zip(times, STEPS)]
WORK_KEY = {slot: i for i, (_, _, works) in enumerate(STEPS) for slot in works}
assert set(WORK_KEY) == {s[0] for s in SLOTS}
rooms = [("Entrance", 0), ("Living room", 3), ("Dining room", 6), ("Kitchen", 7), ("Bedroom", 11), ("Bathroom", 13)]
WRITE_WEB = "--web" in sys.argv
os.makedirs(OUT, exist_ok=True)
os.makedirs(WEB_DATA, exist_ok=True)
with open(os.path.join(OUT, "camera_keys.json"), "w") as f:
    json.dump({"keys": [{"p": k["p"], "pos": list(k["pos"]), "target": list(k["target"])} for k in keys]}, f, indent=1)
path_data = {
    "fov": FOV,
    "walk": WALK,
    "rooms": [{"label": label, "p": P(times[i])} for label, i in rooms],
    "keys": [{"p": k["p"], "pos": to_three(k["pos"]), "target": to_three(k["target"])} for k in keys],
    # each work on show: its eye icon (just inside its frame's top-right
    # corner), the stretch of the walk it shows over, and the catalogue's details
    "products": [{"id": pr["id"], "room": pr["room"], "pos": to_three(pr["eye"]), "centre": to_three(pr["centre"]),
                  "at": P(times[WORK_KEY[pr["id"]]]),
                  "range": [P(times[max(0, WORK_KEY[pr["id"]] - 1)]), P(times[min(len(times) - 1, WORK_KEY[pr["id"]] + 1)])],
                  **{k: pr["work"][k] for k in ("title", "artist", "medium", "size", "image", "aspect", "page")}}
                 for pr in products],
}
# The doors: each swings open as the walk comes to it and, the bedroom's,
# shut again behind it once the walk has gone on into the bathroom (keys:
# 9 at the bedroom door, 10 through it, 12 at the bathroom door, 13 inside)
path_data["doors"] = [
    {"id": "bed", "hinge": to_three((BED_DOOR[1] - 0.01, SPLIT, 0.0)), "openDeg": 92,
     "open": [P(times[8]), P(times[9])], "close": [P(times[12]), P(times[13])]},
    {"id": "bath", "hinge": to_three((BATH[0], BATH_DOOR[1] - 0.01, 0.0)), "openDeg": 92,
     "open": [P(times[11]), P(times[12])], "close": None},
]
with open(os.path.join(WEB_DATA if WRITE_WEB else OUT, "path.json"), "w") as f:
    json.dump(path_data, f, indent=1)

print("[home] objects", len(bpy.data.objects))
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("[home] saved", BLEND)
