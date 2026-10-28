"""Builds the gallery walkthrough scene from scratch.

Run: tools/blender-4.5.15-windows-x64/blender.exe -b --factory-startup -P scene/build_scene.py

Blender coordinates: X east, Y north, Z up, metres. The walk starts facing north
at the library, slides east past the curtains, then turns into "frame B", a
second grid rotated 40 degrees clockwise that holds the black volume, the vault
and the beige room.
"""
import json
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import art, tex  # noqa: E402
from lib.camera_path import to_three  # noqa: E402
from lib.collection import CREDITS, WORKS  # noqa: E402
from lib.geo import (area, box, cylinder, disk, finish, frame_matrix, group, link, material,  # noqa: E402
                     plane, point, rot_z, spot, torus, wall_quad)
from lib.paths import ASSETS, BLEND, OUT, WEB_DATA  # noqa: E402

random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

H_A = 3.8          # ceiling height, dark gallery
H_B = 3.6          # ceiling height, frame B
B_ANGLE = -40.0
B_ORIGIN = (14.0, 3.5, 0.0)
FB = frame_matrix(B_ORIGIN, B_ANGLE)


def B(u, v, z=0.0):
    return FB @ Vector((u, v, z))


def B2(u, v):
    p = B(u, v)
    return (p.x, p.y)


# ================================================================ materials
print("[build] textures")
T = tex
M = {}


def mk(name, maps, **kw):
    M[name] = material(name, maps, **kw)
    return M[name]


# smooth warm-beige stone floor (the reference shows little mottling)
mk("floor_a", T.write_set("floor_a", T.tinted_albedo("smooth_concrete_floor", (1.0, 0.88, 0.7), contrast=0.5, sat=0.45, target=0.3),
                          T.roughness("smooth_concrete_floor", 0.7, 0.12), T.normal("smooth_concrete_floor")),
   normal_strength=0.25, web={"env": 0.3})
mk("rug", T.write_set("rug", T.tinted_albedo("poly_wool_herringbone", (0.42, 0.48, 0.33), 0.85),
                      T.roughness("poly_wool_herringbone", 1.0, 0.1), T.normal("poly_wool_herringbone")),
   normal_strength=0.8, web={"env": 0.0})
# dark walls: smooth charcoal-brown microcement, only faintly clouded
mk("plaster_dark", T.write_set("plaster_dark", T.tinted_albedo("grey_plaster_02", (0.25, 0.22, 0.19), 1.0, 0.5),
                               T.roughness("grey_plaster_02", 0.9, 0.1), T.normal("grey_plaster_02")),
   normal_strength=0.4, web={"env": 0.15})
mk("plaster_black", T.write_set("plaster_black", T.tinted_albedo("grey_plaster_02", (0.045, 0.042, 0.04), 1.0, 0.45),
                                T.roughness("grey_plaster_02", 0.9, 0.05), T.normal("grey_plaster_02")),
   normal_strength=0.5, web={"env": 0.2})
# beige room: a greyer, less peachy beige
mk("plaster_beige", T.write_set("plaster_beige", T.tinted_albedo("clay_plaster", (1.0, 0.965, 0.9), contrast=0.3, sat=0.1, target=0.4),
                                T.roughness("clay_plaster", 1.0, 0.1), T.normal("clay_plaster")),
   normal_strength=0.15, web={"env": 0.1})
# the rounded pillar: dark, smooth and slightly lustrous
mk("charcoal", T.write_set("charcoal", T.tinted_albedo("grey_plaster_02", (0.07, 0.062, 0.055), 1.0, 0.35),
                           T.roughness("grey_plaster_02", 0.5, 0.05), T.normal("grey_plaster_02")),
   normal_strength=0.2, web={"env": 0.45})
mk("ceiling_dark", T.write_set("ceiling_dark", T.solid((0.018, 0.016, 0.014))), rough=0.9, web={"env": 0.0})
mk("ceiling_wood", T.write_set("ceiling_wood", T.tinted_albedo("smoked_walnut_veneer", (0.55, 0.45, 0.36), 0.8),
                               T.roughness("smoked_walnut_veneer", 1.0, 0.2)), web={"env": 0.1})
# (no marble_01 roughness/normal: that scan is laid in blocks, which showed up
# as tiles in the highlights)
mk("marble_green", T.write_set("marble_green", T.verde_marble()), rough=0.3, web={"env": 0.9})
mk("terrazzo", T.write_set("terrazzo", T.remap_albedo("marble_01", (0.015, 0.015, 0.015), (0.7, 0.68, 0.64), 0.6),
                           T.roughness("marble_01", 0.5, 0.15)), web={"env": 0.5})
# the panel's speckled black-and-white stone
mk("terrazzo_dark", T.write_set("terrazzo_dark", T.speckled_stone()), rough=0.45, web={"env": 0.5})
mk("sienna", None, color=(0.24, 0.085, 0.04), rough=0.6, web={"env": 0.3})
mk("curtain", T.write_set("curtain", T.curtain_albedo(), T.roughness("velour_velvet", 1.0, 0.05), T.normal("velour_velvet")),
   normal_strength=0.6, web={"env": 0.2})
mk("olive", T.write_set("olive", T.tinted_albedo("velour_velvet", (0.55, 0.62, 0.36), sat=0.0, target=0.07),
                        T.roughness("velour_velvet", 1.0, 0.1), T.normal("velour_velvet")),
   normal_strength=0.5, web={"env": 0.1})
mk("walnut", T.write_set("walnut", T.tinted_albedo("american_walnut_veneer", (1.0, 0.9, 0.8), 1.0),
                         T.roughness("american_walnut_veneer", 0.7, 0.0), T.normal("american_walnut_veneer")),
   normal_strength=0.3, web={"env": 0.5})
mk("smoked", T.write_set("smoked", T.tinted_albedo("smoked_walnut_veneer", (0.3, 0.27, 0.24), 0.6),
                         T.roughness("smoked_walnut_veneer", 0.8, 0.1)), web={"env": 0.35})
mk("black_wood", T.write_set("black_wood", T.tinted_albedo("smoked_walnut_veneer", (0.085, 0.082, 0.078), 0.6, sat=0.2),
                             T.roughness("smoked_walnut_veneer", 0.7, 0.1)), web={"env": 0.35})
mk("oak_floor", T.write_set("oak_floor", T.tinted_albedo("oak_veneer_01", (1.0, 0.86, 0.68), sat=0.6, target=0.3),
                            T.roughness("oak_veneer_01", 0.6, 0.05), T.normal("oak_veneer_01")),
   normal_strength=0.3, web={"env": 0.8})
mk("oak", T.write_set("oak", T.tinted_albedo("oak_veneer_01", (1.0, 0.88, 0.72), 1.0),
                      T.roughness("oak_veneer_01", 0.8, 0.1), T.normal("oak_veneer_01")),
   normal_strength=0.3, web={"env": 0.4})
mk("stone_light", T.write_set("stone_light", T.tinted_albedo("smooth_concrete_floor", (1.0, 0.93, 0.82), 1.3),
                              T.roughness("smooth_concrete_floor", 1.0, 0.1)), web={"env": 0.2})
mk("artwork", T.write_set("artwork", T.artwork_albedo()), rough=0.85, web={"env": 0.05})
mk("brass", None, color=(0.78, 0.52, 0.24), rough=0.28, metal=1.0, web={"env": 1.0})
mk("steel_dark", None, color=(0.05, 0.05, 0.055), rough=0.35, metal=1.0, web={"env": 1.0})
mk("steel", None, color=(0.3, 0.29, 0.28), rough=0.42, metal=1.0, web={"env": 1.0})
mk("black_matte", None, color=(0.012, 0.012, 0.012), rough=0.6, web={"env": 0.2})
mk("terracotta", None, color=(0.42, 0.13, 0.05), rough=0.45, metal=0.3, web={"env": 0.6})
mk("copper", None, color=(0.22, 0.09, 0.045), rough=0.35, metal=0.6, web={"env": 0.8})
mk("steel_black", None, color=(0.025, 0.025, 0.027), rough=0.38, metal=0.85, web={"env": 0.9})
mk("trim", None, color=(0.3, 0.3, 0.3), rough=0.35, metal=1.0, web={"env": 1.0})
mk("mirror", None, color=(0.85, 0.85, 0.83), rough=0.06, metal=1.0, web={"env": 1.0})
mk("vault_inner", None, color=(0.75, 0.17, 0.012), rough=0.55, web={"env": 0.1})
mk("lamp_shade", None, color=(0.95, 0.93, 0.9), rough=0.4,
   emission=(1.0, 0.82, 0.62), emission_strength=4.0, web={"env": 0.0, "emissive": True})
mk("emit_lens", None, color=(1, 1, 1), rough=0.3,
   emission=(1.0, 0.8, 0.58), emission_strength=40.0, web={"env": 0.0, "emissive": True})
mk("emit_strip", None, color=(1, 1, 1), rough=0.3,
   emission=(1.0, 0.86, 0.7), emission_strength=14.0, web={"env": 0.0, "emissive": True})
mk("emit_shelf", None, color=(1, 1, 1), rough=0.3,
   emission=(1.0, 0.8, 0.6), emission_strength=3.0, web={"env": 0.0, "emissive": True})

# sample tiles on the shelves: mostly pale stone, oak and beige, a few darker
SWATCHES = [M[n] for n in ("oak", "oak", "oak", "stone_light", "stone_light", "stone_light", "plaster_beige",
                           "plaster_beige", "walnut", "walnut", "terrazzo", "smoked")]

# ============================================================ room A shell
print("[build] room A")
G_FLOOR_A, G_WALL_A, G_LIB, G_FURN_A = "floor_a", "walls_a", "library", "furniture_a"

box("FloorA", G_FLOOR_A, M["floor_a"], (24.0, 13.6, 0.1), (5.0, 2.0, -0.1), tile=2.5)
box("Rug", G_FLOOR_A, M["rug"], (7.8, 3.0, 0.012), (1.6, 3.95, 0.0), tile=1.2)

box("CeilingA", G_WALL_A, M["ceiling_dark"], (24.0, 13.6, 0.1), (5.0, 2.0, H_A), tile=2.0)
wall_quad("WallNorthA", G_WALL_A, M["plaster_dark"], (14.0, 6.0), (-7.0, 6.0), 0, H_A)
wall_quad("WallWestA", G_WALL_A, M["plaster_dark"], (-7.0, 6.0), (-7.0, -4.5), 0, H_A)
wall_quad("WallSouthA", G_WALL_A, M["plaster_dark"], (-7.0, -4.5), (15.8, -4.5), 0, H_A)
wall_quad("CorridorEast", G_WALL_A, M["plaster_dark"], (14.0, 9.0), (14.0, 6.0), 0, H_A)
# the corridor's far side: from the black volume's back corner to the room's
# doorway, hiding the slot behind the volume
wall_quad("CorridorSide", G_WALL_A, M["plaster_dark"], (17.21, 7.33), (16.4, 9.0), 0, H_A)
box("CorridorCeil", G_WALL_A, M["ceiling_dark"], (4.0, 3.0, 0.1), (15.6, 7.3, H_A), tile=2.0)

# ================================================================ side room
# A 7 x 7 m dark plaster room at the end of the corridor. Its doorway faces the
# back wall, so stepping in shows the left, back and right walls at once; most
# of the collection hangs here (see the artworks section).
G_ROOM = "room"
RX0, RX1, RY0, RY1 = 11.7, 18.7, 9.0, 16.0
DOOR_X0, DOOR_X1, DOOR_H = 14.0, 16.4, 3.0
ROOM_CX, ROOM_CY = (RX0 + RX1) / 2, (RY0 + RY1) / 2
# floor and ceiling start at y 8.8, where frame A's floor and ceiling end
box("FloorRoom", G_ROOM, M["floor_a"], (RX1 - RX0 + 0.3, RY1 + 0.15 - 8.8, 0.1), (ROOM_CX, (8.8 + RY1 + 0.15) / 2, -0.1), tile=2.5)
box("CeilingRoom", G_ROOM, M["ceiling_dark"], (RX1 - RX0 + 0.3, RY1 + 0.15 - 8.8, 0.1), (ROOM_CX, (8.8 + RY1 + 0.15) / 2, H_A),
    tile=2.0)
wall_quad("RoomWest", G_ROOM, M["plaster_dark"], (RX0, RY1), (RX0, RY0), 0, H_A)
wall_quad("RoomBack", G_ROOM, M["plaster_dark"], (RX1, RY1), (RX0, RY1), 0, H_A)
wall_quad("RoomEast", G_ROOM, M["plaster_dark"], (RX1, RY0), (RX1, RY1), 0, H_A)
wall_quad("RoomFrontL", G_ROOM, M["plaster_dark"], (RX0, RY0), (DOOR_X0, RY0), 0, H_A)
wall_quad("RoomFrontR", G_ROOM, M["plaster_dark"], (DOOR_X1, RY0), (RX1, RY0), 0, H_A)
wall_quad("RoomLintel", G_ROOM, M["plaster_dark"], (DOOR_X0, RY0), (DOOR_X1, RY0), DOOR_H, H_A)

# pillar between library and curtains (a dark rounded column), and the plaster
# pier after them
import bmesh  # noqa: E402
pillar = box("Pillar", G_WALL_A, M["charcoal"], (1.0, 0.6, H_A), (5.0, 5.7, 0.0), tile=2.0)
bm = bmesh.new()
bm.from_mesh(pillar.data)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1.0],
                offset=0.26, segments=10, affect="EDGES", profile=0.5)
for f in bm.faces:
    f.smooth = abs(f.normal.z) < 0.5
bm.to_mesh(pillar.data)
bm.free()
from lib.geo import box_uv  # noqa: E402
box_uv(pillar.data, 2.0)
box("PierEast", G_WALL_A, M["plaster_dark"], (1.8, 0.35, H_A), (13.1, 5.82, 0.0), tile=2.0)

# =================================================================== library
print("[build] library")
SHELF_Z = [0.5, 1.01, 1.52, 2.03, 2.54, 3.05]
DEPTH = 0.42
Y_BACK = 6.0
Y_FRONT = Y_BACK - DEPTH
T_BOARD = 0.03


def shelving(name, x0, x1, bays, niche=None):
    xs = [x0 + (x1 - x0) * i / bays for i in range(bays + 1)]
    cy = Y_BACK - DEPTH / 2
    box(f"{name}_plinth", G_LIB, M["smoked"], (x1 - x0, DEPTH, SHELF_Z[0]), ((x0 + x1) / 2, cy, 0.0), tile=1.5)
    for i, x in enumerate(xs):
        box(f"{name}_v{i}", G_LIB, M["smoked"], (T_BOARD, DEPTH, SHELF_Z[-1] - SHELF_Z[0]), (x, cy, SHELF_Z[0]), tile=1.5)
    for j, z in enumerate(SHELF_Z):
        box(f"{name}_h{j}", G_LIB, M["smoked"], (x1 - x0, DEPTH, T_BOARD), ((x0 + x1) / 2, cy, z - T_BOARD), tile=1.5)
    for i in range(bays):
        for j in range(len(SHELF_Z) - 1):
            bx0, bx1 = xs[i] + T_BOARD, xs[i + 1] - T_BOARD
            z = SHELF_Z[j]
            if niche and i in niche[0] and j in niche[1]:
                box(f"{name}_n{i}{j}", G_LIB, M["black_matte"], (bx1 - bx0 + 0.04, 0.02, SHELF_Z[j + 1] - z),
                    ((bx0 + bx1) / 2, Y_BACK - 0.03, z), tile=1.0)
                continue
            # LED strip under the board above, toward the front edge
            box(f"{name}_led{i}{j}", G_LIB, M["emit_shelf"], (bx1 - bx0 - 0.02, 0.015, 0.006),
                ((bx0 + bx1) / 2, Y_FRONT + 0.04, SHELF_Z[j + 1] - T_BOARD - 0.006), tile=1.0)
            # square sample tiles facing out, each leaning sideways on the one
            # before like fallen dominoes: from the front the row reads as a
            # saw-tooth of lit faces and shadowed edges
            x = bx0 + 0.04
            while x < bx1 - 0.3:
                w = random.uniform(0.22, 0.26)
                h = random.uniform(0.24, 0.28)
                m = random.choice(SWATCHES)
                lean = random.uniform(32, 42)
                ob = box(f"{name}_c{i}{j}_{x:.2f}", G_LIB, m, (w, 0.016, h), (0, 0, 0), tile=0.6)
                # pivot on the bottom-right corner, lean to the right
                ob.data.transform(Matrix.Translation((x + w, Y_BACK - 0.2 + random.uniform(-0.03, 0.03), z))
                                  @ rot_z(random.uniform(-10, 10))
                                  @ Matrix.Rotation(math.radians(lean), 4, "Y")
                                  @ Matrix.Translation((-w / 2, 0, 0)))
                ob.data.update()
                x += random.uniform(0.1, 0.12)


shelving("ShelfL", -6.0, -2.6, 4)
shelving("ShelfC", -1.0, 3.3, 5, niche=({1, 2, 3}, {2, 3}))
shelving("ShelfR", 3.3, 4.5, 2)

# central display panel: dark charcoal board with material swatches and a
# "WOODWORK" label, laid out as in the reference (centres x, z; sizes w, h)
box("Panel", G_LIB, M["plaster_dark"], (1.6, 0.12, 2.55), (-1.8, 5.94, 0.5), tile=1.5)
box("PanelPlinth", G_LIB, M["plaster_dark"], (1.6, DEPTH, 0.5), (-1.8, Y_BACK - DEPTH / 2, 0.0), tile=1.5)
for nm, m, (w, h), (x, z) in [
    ("SwTan", "oak", (0.25, 0.23), (-2.385, 2.6)),
    ("SwCopper", "sienna", (0.38, 0.85), (-1.93, 2.33)),
    ("SwBeigeTop", "plaster_beige", (0.41, 0.44), (-1.27, 2.54)),
    ("SwOakMid", "oak", (0.25, 0.27), (-2.385, 2.04)),
    ("SwBeigeMid", "plaster_beige", (0.44, 0.43), (-1.29, 1.79)),
    ("SwTerrazzo", "terrazzo_dark", (0.83, 0.86), (-2.16, 1.21)),
    ("SwBeigeLow", "plaster_beige", (0.44, 0.46), (-1.29, 1.02)),
]:
    box(nm, G_LIB, M[m], (w, 0.025, h), (x, 5.865, z - h / 2), tile=0.8)
label = bpy.data.curves.new("PanelLabel", "FONT")
label.body = "WOODWORK"
label.size = 0.09
label.extrude = 0.002
label.align_x = "CENTER"
text_ob = bpy.data.objects.new("PanelLabelText", label)
scene.collection.objects.link(text_ob)
label_me = bpy.data.meshes.new_from_object(text_ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
bpy.data.objects.remove(text_ob)
label_me.transform(Matrix.Translation((-1.8, 5.876, 2.95)) @ Matrix.Rotation(math.radians(90), 4, "X"))
label_me.materials.clear()
label_me.materials.append(M["stone_light"])
box_uv(label_me, 0.5)
label_ob = bpy.data.objects.new("PanelLabel", label_me)
scene.collection.objects.link(label_ob)
link(label_ob, G_LIB)

# ================================================================ furniture A
print("[build] furniture A")
box("TableTop", G_FURN_A, M["oak"], (5.0, 1.0, 0.07), (1.4, 4.45, 0.71), tile=1.8, bevel=0.006)
for i, x in enumerate((-0.55, 3.35)):
    box(f"TableLeg{i}", G_FURN_A, M["steel_dark"], (0.08, 0.78, 0.71), (x, 4.45, 0.0), tile=1.0)
box("TableCab", G_FURN_A, M["smoked"], (1.7, 0.6, 0.62), (2.75, 4.45, 0.0), tile=1.2)

# pendant cylinder spots in front of the shelving
PENDANTS = [(-0.25, 5.05, 2.22, 25), (1.05, 5.0, 2.3, -18), (2.35, 5.08, 2.2, 30), (3.65, 5.05, 2.32, -10)]
for i, (x, y, z, tilt) in enumerate(PENDANTS):
    rod = cylinder(f"PendantRod{i}", G_FURN_A, M["black_matte"], 0.006, H_A - z - 0.12,
                   Matrix.Translation((x, y, z + 0.12)), segments=8)
    m = (Matrix.Translation((x, y, z + 0.1)) @ Matrix.Rotation(math.radians(tilt), 4, "X")
         @ Matrix.Rotation(math.radians(160), 4, "X") @ Matrix.Rotation(math.radians(tilt * 0.6), 4, "Y"))
    cylinder(f"Pendant{i}", G_FURN_A, M["brass"], 0.13, 0.38, m, segments=40)
    disk(f"PendantLens{i}", G_FURN_A, M["emit_lens"], 0.1, m @ Matrix.Translation((0, 0, 0.381)), seg=32)

# marble bench before the curtains: a split-face green marble block, its
# sides chiselled and uneven, its top flat and polished
def rough_block(name, grp, mat, size, center, depth=0.03, seed=5):
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=14, use_grid_fill=True)
    sides = {v: Vector((1.0 if v.co.x > 0.499 else -1.0 if v.co.x < -0.499 else 0.0,
                        1.0 if v.co.y > 0.499 else -1.0 if v.co.y < -0.499 else 0.0, 0.0)) for v in bm.verts}
    tops = {v: v.co.z > 0.499 for v in bm.verts}
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((sx, sy, sz, 1)), verts=bm.verts)
    rng = random.Random(seed)
    ph = [rng.uniform(0, 6.28) for _ in range(6)]
    for v in bm.verts:
        out = sides[v]
        if not out.length:
            continue
        x, y, z = v.co
        # coherent chisel noise in metres, gentler along the polished top arris
        f = (math.sin(x * 7.0 + ph[0]) * math.sin(z * 21 + ph[1])
             + 0.6 * math.sin(y * 13 + x * 5 + ph[2]) * math.sin(z * 37 + ph[3])
             + 0.4 * math.sin((x + y) * 29 + ph[4]) * math.sin(z * 53 + ph[5]))
        v.co += out.normalized() * depth * (0.5 + 0.35 * f) * (0.35 if tops[v] else 1.0)
    bmesh.ops.translate(bm, vec=Vector(center) + Vector((0, 0, sz / 2)), verts=bm.verts)
    bm.normal_update()
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.7      # chiselled sides soft, polished top crisp
    return finish(bm, name, grp, [mat], 1.2)


rough_block("MarbleBench", G_FURN_A, M["marble_green"], (2.8, 0.66, 0.46), (9.0, 4.85, 0.0), depth=0.05)

# curtains: pleated sheet with bands of colour
print("[build] curtains")


def curtain(name, x0, x1, y, z0, z1, depth=0.11, period=0.14):
    """Deep, slightly irregular pleats (the reference shows strong vertical
    light-and-shadow lines); UVs span the full width so the colour zones of
    curtain_albedo fall across the curtain once."""
    bm = bmesh.new()
    n = int((x1 - x0) / 0.01)
    cols = []
    phase = 0.0
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        jitter = 0.65 + 0.35 * math.sin(x * 1.7) * math.sin(x * 0.53)
        # pleat spacing wanders a little so the folds are not machine-regular
        phase += 2 * math.pi * ((x1 - x0) / n) / (period * (1 + 0.25 * math.sin(x * 2.3)))
        yy = y - depth * jitter * (0.5 + 0.5 * math.sin(phase))
        cols.append([bm.verts.new((x, yy, z)) for z in (z0, (z0 + z1) / 2, z1)])
    for i in range(n):
        for k in range(2):
            f = bm.faces.new((cols[i][k], cols[i + 1][k], cols[i + 1][k + 1], cols[i][k + 1]))
            f.smooth = True
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M["curtain"])
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - x0) / (x1 - x0), co.z / 3.0)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    link(ob, G_FURN_A)
    # flip so normals face -Y (toward the camera)
    import bmesh as _b
    bm = _b.new()
    bm.from_mesh(me)
    for f in bm.faces:
        if f.normal.y > 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    return ob


curtain("Curtain", 5.5, 12.2, 5.92, 0.0, H_A - 0.05)
box("CurtainTrack", G_FURN_A, M["black_matte"], (6.8, 0.12, 0.06), (8.85, 5.85, H_A - 0.06), tile=1.0)
# the row of small lights along the curtain head
for i in range(19):
    x = 5.75 + i * 0.35
    disk(f"TrackLight{i}", G_FURN_A, M["emit_lens"], 0.018,
         Matrix.Translation((x, 5.8, H_A - 0.062)) @ Matrix.Rotation(math.pi, 4, "X"), 12)

# ====================================================================== frame B
print("[build] frame B")
G_FLOOR_B, G_WALL_B, G_VAULT, G_FURN_B = "floor_b", "walls_b", "vault", "furniture_b"
# the black volume runs 4 m past the vault before the beige room begins
DU = 2.25                # how far the beige room sits beyond the first layout
ROOM_U1 = 16.5 + DU      # beige room's far (right) wall

# (stops at v 5.8, just behind the art wall, so it never pokes up through the
# side room's floor)
box("FloorB", G_FLOOR_B, M["oak_floor"], (17.5 + DU, 11.3, 0.1), (7.5 + DU / 2, 0.15, -0.07), frame=FB, tile=2.2)
# slatted wood ceiling with linear lights over the vault corridor; the beige
# room has a black ceiling, entered under a deep black bulkhead
CEIL_SPLIT = 6.8 + DU
box("CeilingB", G_WALL_B, M["ceiling_wood"], (CEIL_SPLIT + 1.5, 10.6, 0.2), ((CEIL_SPLIT - 1.5) / 2, 0.3, H_B),
    frame=FB, tile=2.0)
box("CeilingBeige", G_WALL_B, M["ceiling_dark"], (ROOM_U1 - CEIL_SPLIT + 0.2, 10.6, 0.2), ((CEIL_SPLIT + ROOM_U1 + 0.2) / 2, 0.3, H_B),
    frame=FB, tile=2.0)
box("Bulkhead", G_WALL_B, M["ceiling_dark"], (0.7, 10.6, 0.45), (CEIL_SPLIT + 0.35, 0.3, H_B - 0.45), frame=FB, tile=2.0)
STRIPS_U = [-0.4, 1.6, 3.6, 5.6, 7.6]
for i, u in enumerate(STRIPS_U):
    box(f"StripB{i}", G_WALL_B, M["emit_strip"], (0.12, 10.0, 0.01), (u, 0.3, H_B - 0.012), frame=FB, tile=1.0)

# black volume with a round opening for the vault
VX0, VX1, VY0, VY1 = 0.0, 6.5 + DU, 0.0, 5.0
VAULT_U, VAULT_Z, VAULT_R = 4.75, 1.62, 1.18
black = box("BlackVolume", G_WALL_B, M["plaster_black"], (VX1 - VX0, VY1 - VY0, H_B),
            ((VX0 + VX1) / 2, (VY0 + VY1) / 2, 0.0), frame=FB, tile=2.0,
            face_mats={"+x": M["plaster_beige"]})
def cut(target, cutter):
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"
    with bpy.context.temp_override(object=target, active_object=target, selected_objects=[target]):
        bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter)


# the round opening leads through a short dark tunnel into the vault proper:
# a small orange room where the most valuable works hang; each cutter's
# material becomes the surface it cuts
TUNNEL_V = 0.45
CH_U0, CH_U1, CH_V1, CH_Z0, CH_Z1 = 2.45, 7.05, 3.6, 0.12, 3.2
along_v = Matrix.Rotation(math.radians(-90), 4, "X")
# (the tunnel cutter reaches 40 cm into the room: coincident faces make the
# exact boolean produce broken faces)
cut(black, cylinder("VaultCutter", G_WALL_B, M["steel_dark"], VAULT_R, TUNNEL_V + 0.4,
                    FB @ Matrix.Translation((VAULT_U, -0.3, VAULT_Z)) @ along_v, segments=64))
cut(black, box("ChamberCutter", G_WALL_B, M["vault_inner"], (CH_U1 - CH_U0, CH_V1 - TUNNEL_V, CH_Z1 - CH_Z0),
               ((CH_U0 + CH_U1) / 2, (TUNNEL_V + CH_V1) / 2, CH_Z0), frame=FB))
box_uv(black.data, 2.0, B_ANGLE)
# thin steel trim lines framing the panels, as in the reference
TRIM_Z = 3.15
box("TrimTop", G_WALL_B, M["trim"], (VX1 - VX0, 0.012, 0.018), ((VX0 + VX1) / 2, -0.006, TRIM_Z), frame=FB, tile=1.0)
for i, u in enumerate((VAULT_U - 1.95, VAULT_U + 2.3)):
    box(f"TrimV{i}", G_WALL_B, M["trim"], (0.018, 0.012, TRIM_Z), (u, -0.006, 0.0), frame=FB, tile=1.0)
box("TrimCorner", G_WALL_B, M["trim"], (0.02, 0.02, H_B), (VX1 - 0.01, -0.01, 0.0), frame=FB, tile=1.0)

# a walnut floor in the vault room and a low warm glow (the works have their own spots)
box("VaultFloor", G_VAULT, M["walnut"], (CH_U1 - CH_U0, CH_V1 - TUNNEL_V, 0.02), ((CH_U0 + CH_U1) / 2, (TUNNEL_V + CH_V1) / 2, CH_Z0),
    frame=FB, tile=1.5)
point("VaultGlow", B(VAULT_U, 1.4, 2.8), 14, k=2300, radius=0.3)
point("VaultGlow3", B(VAULT_U - 0.7, 0.6, 1.6), 6, k=2300, radius=0.2)

# dark rim around the opening, a fine trim ring and a larger engraved circle
ring_m = FB @ Matrix.Translation((VAULT_U, -0.06, VAULT_Z)) @ Matrix.Rotation(math.radians(90), 4, "X")
torus("VaultRing", G_VAULT, M["steel_dark"], VAULT_R + 0.06, 0.09, ring_m, seg=64, ring=16)
torus("VaultRingTrim", G_VAULT, M["trim"], VAULT_R - 0.03, 0.012, ring_m, seg=64, ring=8)
torus("VaultCircle", G_VAULT, M["trim"], 1.62, 0.01,
      FB @ Matrix.Translation((VAULT_U, -0.002, VAULT_Z)) @ Matrix.Rotation(math.radians(90), 4, "X"), seg=96, ring=6)
# The door: a thick round plate of blackened steel with a gold bolt ring and
# wheel, mounted in front of the opening's rim and hinged on the left so it
# swings OUT into the room, like a bank vault. It is built (and baked around)
# swung open DOOR_OPEN degrees; on the website it is not baked but animated,
# turning about the hinge axis to close as the camera moves away.
G_DOOR = "vault_door"
DOOR_R, DOOR_T, DOOR_OPEN = 1.2, 0.3, -100.0
DOOR_BACK = -0.155               # just clear of the rim torus (it reaches v -0.15)
HINGE_GAP = 0.12                 # hinge axis to the door's edge
HINGE = (VAULT_U - DOOR_R - HINGE_GAP, DOOR_BACK - DOOR_T / 2, VAULT_Z)
hinge = FB @ Matrix.Translation(HINGE) @ rot_z(DOOR_OPEN)
# door-centre frame: local +z faces the room (frame -v) when closed
door_m = hinge @ Matrix.Translation((DOOR_R + HINGE_GAP, 0, 0)) @ Matrix.Rotation(math.radians(90), 4, "X")
face = DOOR_T / 2
door_parts = [
    cylinder("VaultDoor", G_DOOR, M["steel_black"], DOOR_R, DOOR_T, door_m @ Matrix.Translation((0, 0, -DOOR_T / 2)), segments=72),
    torus("DoorEdge", G_DOOR, M["steel_dark"], DOOR_R - 0.04, 0.05, door_m @ Matrix.Translation((0, 0, face)), seg=72, ring=10),
    torus("DoorBolts", G_DOOR, M["brass"], DOOR_R - 0.22, 0.042, door_m @ Matrix.Translation((0, 0, face + 0.01)), seg=64, ring=10),
    torus("DoorArc", G_DOOR, M["brass"], 0.55, 0.033, door_m @ Matrix.Translation((0, 0, face + 0.02)), seg=48, ring=8, arc=250),
    torus("DoorWheel", G_DOOR, M["brass"], 0.28, 0.03, door_m @ Matrix.Translation((0, 0, face + 0.12)), seg=40, ring=8),
    cylinder("DoorHub", G_DOOR, M["brass"], 0.09, 0.16, door_m @ Matrix.Translation((0, 0, face)), segments=24),
    # the back face's plug, which seats into the rim when closed (seen when open)
    cylinder("DoorPlug", G_DOOR, M["steel_dark"], VAULT_R - 0.12, 0.1, door_m @ Matrix.Translation((0, 0, -face - 0.1)), segments=64),
]
for k in range(3):
    a = k * 120
    door_parts.append(cylinder(f"DoorSpoke{k}", G_DOOR, M["brass"], 0.018, 0.56,
                               door_m @ Matrix.Translation((0, 0, face + 0.12)) @ rot_z(a)
                               @ Matrix.Rotation(math.radians(90), 4, "Y") @ Matrix.Translation((0, 0, -0.28)),
                               segments=10))
# hinge: arms from the door's edge to the knuckles, which turn on a barrel
# fixed to the wall (the barrel stays put, so it is baked with the vault)
ARM_L = HINGE_GAP + 0.35          # reaches well into the plate at the arms' height
for k, dz in enumerate((-0.65, 0.65)):
    arm = Matrix.Translation((0, 0, dz))
    door_parts.append(box(f"DoorArm{k}", G_DOOR, M["steel_dark"], (ARM_L, 0.14, 0.16), (0, 0, 0), tile=0.5))
    door_parts[-1].data.transform(hinge @ arm @ Matrix.Translation((ARM_L / 2 - 0.02, 0, -0.08)))
    door_parts.append(cylinder(f"DoorKnuckle{k}", G_DOOR, M["steel_dark"], 0.075, 0.22,
                               hinge @ arm @ Matrix.Translation((0, 0, -0.11)), segments=20))
cylinder("HingeBarrel", G_VAULT, M["steel_dark"], 0.05, 2.0,
         FB @ Matrix.Translation((HINGE[0], HINGE[1], VAULT_Z - 1.0)), segments=16)
for k, dz in enumerate((-0.95, 0.95)):
    box(f"HingeMount{k}", G_VAULT, M["steel_dark"], (0.16, -HINGE[1] + 0.02, 0.1),
        (HINGE[0], HINGE[1] / 2, VAULT_Z + dz - 0.05), frame=FB, tile=0.5)
for ob in door_parts:
    ob["door"] = True       # exported as glTF extras; the website finds the door by it
    # a stand-in second UV set: the door shares materials with baked meshes,
    # whose export samples a "Lightmap" UV (see export.py)
    ob.data.uv_layers.new(name="Lightmap")

# rounded wooden plinth in front of the vault
pl = box("VaultPlinth", G_VAULT, M["walnut"], (3.0, 0.95, 0.14), (VAULT_U, -0.55, 0.0), frame=FB, tile=1.5)
bm = bmesh.new()
bm.from_mesh(pl.data)
vert_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1]
bmesh.ops.bevel(bm, geom=vert_edges, offset=0.46, segments=10, affect="EDGES", profile=0.5)
bm.to_mesh(pl.data)
bm.free()
box_uv(pl.data, 1.5, B_ANGLE)

# ================================================================ beige room
print("[build] beige room")
ART_V = 5.6
wall_quad("ArtWall", G_WALL_B, M["plaster_beige"], B2(ROOM_U1, ART_V), B2(-1.2, ART_V), 0, H_B, angle=B_ANGLE, tile=2.5)
wall_quad("RightWallB", G_WALL_B, M["plaster_beige"], B2(ROOM_U1, -5.0), B2(ROOM_U1, ART_V), 0, H_B, angle=B_ANGLE, tile=2.5)
# closes the gap where room A's south wall ends short of the beige room's
wall_quad("SouthGap", G_WALL_B, M["plaster_dark"], (15.8, -4.5), B2(VX1, -5.0), 0, H_B)
wall_quad("SouthWallB", G_WALL_B, M["plaster_beige"], B2(VX1, -5.0), B2(ROOM_U1, -5.0), 0, H_B, angle=B_ANGLE, tile=2.5)
# beige pilaster at the volume's corner
box("Pilaster", G_WALL_B, M["plaster_beige"], (0.6, 0.5, H_B), (VX1 + 0.3, 0.25, 0.0), frame=FB, tile=2.5)

# artwork: a wide smoky canvas just above the sideboard, with a copper disc
# overlapping a tall rounded mirror (sizes measured from the reference)
CANVAS_U0, CANVAS_W, CANVAS_H, CANVAS_Z0 = 7.55 + DU, 2.3, 1.13, 0.86
canvas = box("Canvas", G_FURN_B, M["artwork"], (CANVAS_W, 0.04, CANVAS_H), (CANVAS_U0 + CANVAS_W / 2, ART_V - 0.03, CANVAS_Z0),
             frame=FB, tile=1.0)
uvl = canvas.data.uv_layers["UVMap"]
inv = FB.inverted()
for poly in canvas.data.polygons:
    for li in poly.loop_indices:
        p = inv @ canvas.data.vertices[canvas.data.loops[li].vertex_index].co
        uvl.data[li].uv = ((p.x - CANVAS_U0) / CANVAS_W, (p.z - CANVAS_Z0) / CANVAS_H)
mir = box("ArtMirrorFrame", G_FURN_B, M["black_matte"], (0.55, 0.04, 0.79), (8.78 + DU, ART_V - 0.065, 0.985), frame=FB, tile=1.0)
mir2 = box("ArtMirror", G_FURN_B, M["mirror"], (0.48, 0.03, 0.72), (8.78 + DU, ART_V - 0.1, 1.02), frame=FB, tile=1.0)
for ob, r in ((mir, 0.1), (mir2, 0.07)):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    edges = [e for e in bm.edges
             if abs((inv @ e.verts[0].co).y - (inv @ e.verts[1].co).y) > 0.02]
    bmesh.ops.bevel(bm, geom=edges, offset=r, segments=8, affect="EDGES", profile=0.5)
    bm.to_mesh(ob.data)
    bm.free()
disc_m = FB @ Matrix.Translation((8.4 + DU, ART_V - 0.117, 1.4)) @ Matrix.Rotation(math.radians(90), 4, "X")
cylinder("ArtDisc", G_FURN_B, M["copper"], 0.315, 0.03, disc_m, segments=64)
torus("ArtDiscRim", G_FURN_B, M["black_matte"], 0.31, 0.012, disc_m @ Matrix.Translation((0, 0, 0.03)), seg=64, ring=8)

# flat-file sideboard: a black carcass of four bays, each with six shallow
# drawers pulled out by different amounts, pale sample sheets showing on some
SB_U0, SB_U1, SB_D, SB_Z0, SB_Z1 = 6.9 + DU, 10.5 + DU, 0.55, 0.06, 0.78
SB_V = ART_V - SB_D / 2
box("SideboardBase", G_FURN_B, M["black_matte"], (SB_U1 - SB_U0 - 0.1, SB_D - 0.1, SB_Z0), ((SB_U0 + SB_U1) / 2, SB_V, 0.0), frame=FB)
box("SideboardTop", G_FURN_B, M["black_wood"], (SB_U1 - SB_U0, SB_D, 0.025), ((SB_U0 + SB_U1) / 2, SB_V, SB_Z1 - 0.025), frame=FB, tile=1.2)
box("SideboardBottom", G_FURN_B, M["black_wood"], (SB_U1 - SB_U0, SB_D, 0.025), ((SB_U0 + SB_U1) / 2, SB_V, SB_Z0), frame=FB, tile=1.2)
box("SideboardBack", G_FURN_B, M["black_wood"], (SB_U1 - SB_U0, 0.02, SB_Z1 - SB_Z0), ((SB_U0 + SB_U1) / 2, ART_V - 0.01, SB_Z0),
    frame=FB, tile=1.2)
BAYS = 4
bay_w = (SB_U1 - SB_U0) / BAYS
for i in range(BAYS + 1):
    box(f"SideboardDiv{i}", G_FURN_B, M["black_wood"], (0.025, SB_D, SB_Z1 - SB_Z0), (SB_U0 + i * bay_w, SB_V, SB_Z0),
        frame=FB, tile=1.2)
DRAWER_H, DRAWER_GAP = 0.088, 0.022
# own generator: adding geometry earlier in the script must not move the
# drawers (that would invalidate their baked lightmap)
DRAWER_RNG = random.Random(7)
for i in range(BAYS):
    cu = SB_U0 + (i + 0.5) * bay_w
    for k in range(6):
        z = SB_Z0 + 0.03 + k * (DRAWER_H + DRAWER_GAP)
        pull = DRAWER_RNG.choice((0.0, 0.02, 0.05, 0.07, 0.1, 0.13))
        box(f"Drawer{i}_{k}", G_FURN_B, M["black_wood"], (bay_w - 0.04, SB_D - 0.06, DRAWER_H),
            (cu, SB_V - pull - 0.01, z), frame=FB, tile=1.0)
        if pull >= 0.05:
            box(f"Sheet{i}_{k}", G_FURN_B, M["stone_light"], (bay_w - 0.1, SB_D - 0.12, 0.004),
                (cu, SB_V - pull - 0.01, z + DRAWER_H), frame=FB, tile=1.0)

# white mushroom lamp on a dark stem at the right end
LAMP = (9.75 + DU, ART_V - 0.3, SB_Z1)
cylinder("LampStem", G_FURN_B, M["black_matte"], 0.018, 0.33, FB @ Matrix.Translation(LAMP), segments=16)
cylinder("LampFoot", G_FURN_B, M["black_matte"], 0.08, 0.02, FB @ Matrix.Translation(LAMP), segments=24)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=0.2)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
for f in bm.faces:
    f.smooth = True
bmesh.ops.transform(bm, matrix=FB @ Matrix.Translation((LAMP[0], LAMP[1], LAMP[2] + 0.33)) @ Matrix.Diagonal((1, 1, 0.45, 1)), verts=bm.verts)
finish(bm, "LampShade", G_FURN_B, [M["lamp_shade"]], 0.5)
point("LampLight", B(LAMP[0], LAMP[1], LAMP[2] + 0.29), 18, k=2700, radius=0.12)

# wide oak stairs rising along the art wall
# (about three wall-wash scallops of bare wall between the lamp and the stairs)
STEPS, RISE, RUN, STAIR_W = 12, 0.19, 0.3, 2.2
STEP_U0 = ROOM_U1 - STEPS * RUN
for k in range(STEPS):
    u = STEP_U0 + k * RUN
    box(f"Step{k}", G_FURN_B, M["oak"], (ROOM_U1 - u, STAIR_W, RISE), ((u + ROOM_U1) / 2, ART_V - STAIR_W / 2, k * RISE),
        frame=FB, tile=1.5)
box("StairStringer", G_FURN_B, M["plaster_beige"], (ROOM_U1 - STEP_U0, 0.08, 0.02),
    ((STEP_U0 + ROOM_U1) / 2, ART_V - STAIR_W - 0.02, 0.0), frame=FB)

# ================================================================== artworks
# 30 works (scene/lib/collection.py says what hangs where and why). Each wall is
# a 2D line: its left end as you face it and the direction to your right; the
# room is on the side of n = (d.y, -d.x). A work is built in the wall's local
# frame: x along the wall, y into it (the front faces -y), z up.
print("[build] artworks")
G_ART = "art"
U_DIR = (math.cos(math.radians(B_ANGLE)), math.sin(math.radians(B_ANGLE)))
V_DIR = (-U_DIR[1], U_DIR[0])
CORR_D = Vector((17.21 - 16.4, 7.33 - 9.0, 0)).normalized()
WALLS = {
    "pier": ((12.2, 5.645), (1.0, 0.0), H_A),
    "corr_s": ((16.4, 9.0), (CORR_D.x, CORR_D.y), H_A),
    "room_n": ((RX0, RY1), (1.0, 0.0), H_A),
    "room_w": ((RX0, RY0), (0.0, 1.0), H_A),
    "room_e": ((RX1, RY1), (0.0, -1.0), H_A),
    "room_fl": ((DOOR_X0, RY0), (-1.0, 0.0), H_A),
    "room_fr": ((RX1, RY0), (-1.0, 0.0), H_A),
    "vol": (B2(0.0, 0.0), U_DIR, H_B),
    "beige": (B2(0.0, ART_V), U_DIR, H_B),
    # hung on cables 7 cm in front of the curtain's deepest pleat
    "curtain": ((5.5, 5.74), (1.0, 0.0), H_A),
    # the black volume's end wall, along the corridor (under frame B's ceiling)
    "vol_w": (B2(0.0, VY1), (-V_DIR[0], -V_DIR[1]), H_B),
    "vault_back": (B2(0.0, CH_V1), U_DIR, CH_Z1),
    # the volume's beige end in the last room; its spot hangs under the bulkhead
    "beige_x": (B2(VX1, 0.0), V_DIR, H_B - 0.45),
}
# the grid of works on paper shares one oak; the float frames are blackened wood
mk("mat_board", None, color=(0.78, 0.76, 0.72), rough=0.95, web={"env": 0.05})
FRAME_MAT = {"black": M["black_wood"], "oak": M["oak"]}


def wall_frame(wall, s):
    """Local axes: x = d, y = -n (into the wall), z up; origin s along the wall."""
    (ox, oy), (dx, dy), _ = WALLS[wall]
    return Matrix(((dx, -dy, 0, ox + dx * s), (dy, dx, 0, oy + dy * s), (0, 0, 1, 0), (0, 0, 0, 1)))


def drop_back(ob, F):
    """Removes faces lying against the wall (never seen, and they would waste lightmap)."""
    into = (F.to_3x3() @ Vector((0, 1, 0))).normalized()
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.dot(into) > 0.9], context="FACES")
    bm.to_mesh(ob.data)
    bm.free()


def art_face(ob, F, x0, z0, w, h):
    """UVs straight from the wall-local position: the image fills the front
    face and its edge pixels wrap round the sides, like a gallery-wrapped canvas."""
    inv = F.inverted()
    uvl = ob.data.uv_layers["UVMap"]
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            p = inv @ ob.data.vertices[ob.data.loops[li].vertex_index].co
            uvl.data[li].uv = (min(1, max(0, (p.x - x0) / w)), min(1, max(0, (p.z - z0) / h)))


def frame_bars(name, F, mat, W, H, z0, fw, depth):
    for k, (size, c) in enumerate((((W, depth, fw), (0, -depth / 2, z0)), ((W, depth, fw), (0, -depth / 2, z0 + H - fw)),
                                    ((fw, depth, H - 2 * fw), (-W / 2 + fw / 2, -depth / 2, z0 + fw)),
                                    ((fw, depth, H - 2 * fw), (W / 2 - fw / 2, -depth / 2, z0 + fw)))):
        drop_back(box(f"{name}_frame{k}", G_ART, mat, size, c, frame=F, tile=0.4), F)


def hang(wid, wall, s, zc, W, H, style, pal, seed, mount):
    F = wall_frame(wall, s)
    z0 = zc - H / 2
    kind, _, wood = mount.partition("_")
    if kind == "canvas":
        D = 0.04
        aw, ah, ax, az = W, H, -W / 2, z0
    elif kind == "float":
        # large works get proportionally heavier mouldings
        fw, D, gap = 0.03 + 0.012 * max(W, H), 0.07, 0.014
        frame_bars(wid, F, FRAME_MAT[wood], W, H, z0, fw, D)
        drop_back(box(f"{wid}_liner", G_ART, M["black_matte"], (W - 2 * fw, 0.012, H - 2 * fw), (0, -0.006, z0 + fw),
                      frame=F, tile=0.5), F)
        aw, ah = W - 2 * fw - 2 * gap, H - 2 * fw - 2 * gap
        ax, az = -aw / 2, z0 + fw + gap
    elif kind == "gold":
        # a deep gilded moulding stepped in two, then a linen slip round the work
        fw, D, lip, slip = 0.085, 0.09, 0.025, 0.045
        frame_bars(wid, F, M["brass"], W, H, z0, fw, D)
        frame_bars(f"{wid}_lip", F, M["brass"], W - 2 * fw, H - 2 * fw, z0 + fw, lip, D - 0.025)
        iw, ih = W - 2 * fw - 2 * lip, H - 2 * fw - 2 * lip
        frame_bars(f"{wid}_slip", F, M["mat_board"], iw, ih, z0 + fw + lip, slip, 0.04)
        drop_back(box(f"{wid}_liner", G_ART, M["black_matte"], (iw, 0.01, ih), (0, -0.005, z0 + fw + lip), frame=F, tile=0.5), F)
        aw, ah = iw - 2 * slip, ih - 2 * slip
        ax, az = -aw / 2, z0 + fw + lip + slip
    else:  # paper behind a mat, the bottom margin a little deeper as is traditional
        fw, D = 0.025 + 0.01 * max(W, H), 0.04
        frame_bars(wid, F, FRAME_MAT[wood], W, H, z0, fw, D)
        iw, ih = W - 2 * fw, H - 2 * fw
        mw = 0.16 * min(W, H)
        mb = mw * 1.2
        aw, ah = iw - 2 * mw, ih - mw - mb
        ax, az = -aw / 2, z0 + fw + mb
        for k, (size, c) in enumerate((((iw, 0.004, mb), (0, -0.018, z0 + fw)),
                                        ((iw, 0.004, mw), (0, -0.018, z0 + fw + ih - mw)),
                                        ((mw, 0.004, ah), (-iw / 2 + mw / 2, -0.018, az)),
                                        ((mw, 0.004, ah), (iw / 2 - mw / 2, -0.018, az)))):
            box(f"{wid}_mat{k}", G_ART, M["mat_board"], size, c, frame=F, tile=0.5)
        drop_back(box(f"{wid}_back", G_ART, M["mat_board"], (iw, 0.004, ih), (0, -0.006, z0 + fw), frame=F, tile=0.5), F)
    img, rough = art.make(style, pal, seed, aw, ah, with_rough=True)
    gilt = rough is not None
    mat = mk(f"art_{wid}", T.write_set(f"art_{wid}", img, rough[..., None].repeat(3, axis=2) if gilt else None),
             rough=0.95 if kind == "paper" else 0.8, web={"env": 0.5 if gilt else 0.05})
    # the sheet sits 4 mm behind the mat; a floated canvas 15 mm inside its frame
    depth, y = {"paper": (0.003, -0.0135), "float": (0.035, -0.0285), "canvas": (D, -D / 2),
                "gold": (0.03, -0.025)}[kind]
    ob = box(f"Art_{wid}", G_ART, mat, (aw, depth, ah), (ax + aw / 2, y, az), frame=F, tile=1.0)
    drop_back(ob, F)
    art_face(ob, F, ax, az, aw, ah)
    if wall == "curtain":   # two steel hanging wires up to the ceiling track
        for x in (-W / 2 + 0.12, W / 2 - 0.12):
            cylinder(f"{wid}_wire{x:+.1f}", G_ART, M["steel"], 0.0025, WALLS[wall][2] - (z0 + H),
                     F @ Matrix.Translation((x, -0.035, z0 + H)), segments=6)


for w in WORKS:
    hang(*w)

def place_model(path, name, grp, matrix):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    for o in new:
        if o.type == "MESH":
            o.data.transform(matrix @ o.matrix_world)
            o.parent = None
            o.matrix_world = Matrix.Identity(4)
            o.name = name if not meshes else f"{name}_{len(meshes)}"
            uv = o.data.uv_layers[0]
            uv.name = "UVMap"
            link(o, grp)
            meshes.append(o)
        else:
            bpy.data.objects.remove(o)
    return meshes


def model(name):
    d = os.path.join(ASSETS, "models", name)
    return os.path.join(d, [f for f in os.listdir(d) if f.endswith(".gltf")][0])


print("[build] models")


def shell_arc(name, grp, mat, radius, thick, z0, z1, arc_deg, matrix, seg=24):
    """Curved chair back: a band of a cylinder wall, open toward local -Y."""
    bm = bmesh.new()
    rows = []
    for i in range(seg + 1):
        a = math.radians(-90 - arc_deg / 2 + arc_deg * i / seg)
        ring = []
        for r in (radius, radius + thick):
            for z in (z0, z1):
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a) * -1.0, z)))
        rows.append(ring)
    for i in range(seg):
        a, b = rows[i], rows[i + 1]
        faces = [(a[0], b[0], b[1], a[1]), (a[3], b[3], b[2], a[2]), (a[1], b[1], b[3], a[3]), (a[2], b[2], b[0], a[0])]
        for f in faces:
            bm.faces.new(f).smooth = True
    bm.faces.new((rows[0][0], rows[0][1], rows[0][3], rows[0][2]))
    bm.faces.new((rows[-1][2], rows[-1][3], rows[-1][1], rows[-1][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(bm, name, grp, [mat], 0.5)


def dining_chair(i, x, y, yaw):
    """Modern dining chair: olive upholstered seat, curved back, slim black legs."""
    m = Matrix.Translation((x, y, 0.0)) @ rot_z(yaw)
    seat = box(f"Chair{i}Seat", G_FURN_A, M["olive"], (0.46, 0.44, 0.07), (0, 0, 0.44), tile=0.6, bevel=0.018)
    seat.data.transform(m)
    for k, (lx, ly) in enumerate(((-0.19, -0.17), (0.19, -0.17), (-0.19, 0.17), (0.19, 0.17))):
        splay = Matrix.Rotation(math.radians(5 * (1 if ly > 0 else -1)), 4, "X") @ Matrix.Rotation(math.radians(-5 * (1 if lx > 0 else -1)), 4, "Y")
        cylinder(f"Chair{i}Leg{k}", G_FURN_A, M["black_matte"], 0.013, 0.45,
                 m @ Matrix.Translation((lx, ly, 0.0)) @ splay, segments=10)
    shell_arc(f"Chair{i}Back", G_FURN_A, M["olive"], 0.24, 0.035, 0.6, 0.86, 150,
              m @ Matrix.Translation((0, 0.04, 0.0)))


# chairs face north toward the table; the curved back sits on the camera side
CHAIR_RNG = random.Random(13)
for i, x in enumerate((-0.3, 0.95, 2.2)):
    dining_chair(i, x, 3.6, 180 + CHAIR_RNG.uniform(-6, 6))
place_model(model("ArmChair_01"), "ArmChair", G_FURN_A, Matrix.Translation((-3.05, 2.55, 0.0)) @ rot_z(-125))

# armchair upholstery -> deep red (same texture detail, new colour)
for mat in bpy.data.materials:
    if mat.name.startswith("Armchair"):
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        link_ = bsdf.inputs["Base Color"].links
        if link_:
            img = link_[0].from_node.image
            img.scale(1024, 1024)
            import numpy as np
            a = np.empty(1024 * 1024 * 4, np.float32)
            img.pixels.foreach_get(a)
            a = a.reshape(1024, 1024, 4)
            lin = tex.srgb_to_lin(a[..., :3])
            lum = tex.luminance(lin)[..., None]
            red = np.array((0.42, 0.035, 0.03), np.float32) * (0.55 + 0.9 * lum / max(1e-6, lum.mean()))
            path = os.path.join(tex.TEX_OUT, "armchair_albedo.jpg")
            tex.save(tex.lin_to_srgb(red), path)
            link_[0].from_node.image = bpy.data.images.load(path)
        mat["web"] = {"env": 0.15}
for mat in bpy.data.materials:
    if "web" not in mat:
        mat["web"] = {"env": 0.4}

# =================================================================== lights
print("[build] lights")
K = 3000
KB = 3300
# library: grazing downlights over the shelving
for i, x in enumerate([-5.2, -3.6, -1.8, -0.1, 1.5, 3.1, 4.3]):
    spot(f"LibWash{i}", (x, 5.25, H_A - 0.02), (x, 5.95, 1.2), 240, 55, 0.7, K, 0.04)
    disk(f"LibCan{i}", G_WALL_A, M["emit_lens"], 0.04, Matrix.Translation((x, 5.25, H_A - 0.001)) @ Matrix.Rotation(math.pi, 4, "X"), 16)
# the pendant spots light the table
for i, (x, y, z, tilt) in enumerate(PENDANTS):
    spot(f"PendantSpot{i}", (x, y - 0.12, z - 0.05), (x + 0.1, 4.2, 0.7), 110, 45, 0.6, K, 0.04)
# soft fill over the room
area("FillA", (0.0, 1.5, H_A - 0.05), (0.0, 1.5, 0.0), 260, 6.0, 4.0, 3000)
area("FillA2", (8.5, 2.0, H_A - 0.05), (8.5, 2.0, 0.0), 200, 5.0, 4.0, 3000)
# pillar and curtains
spot("PillarWash", (5.0, 5.18, H_A - 0.02), (5.0, 5.4, 0.8), 150, 50, 0.8, K, 0.03)
for i, x in enumerate([6.2, 7.5, 8.8, 10.1, 11.4]):
    spot(f"CurtainWash{i}", (x, 5.35, H_A - 0.02), (x, 5.9, 0.9), 140, 60, 0.7, K, 0.04)
    disk(f"CurtainCan{i}", G_WALL_A, M["emit_lens"], 0.04, Matrix.Translation((x, 5.35, H_A - 0.001)) @ Matrix.Rotation(math.pi, 4, "X"), 16)
spot("BenchSpot", (9.0, 3.9, H_A - 0.02), (9.0, 4.85, 0.4), 70, 50, 0.7, K, 0.04)
spot("PierWash", (13.1, 5.3, H_A - 0.02), (13.1, 5.65, 0.8), 150, 50, 0.8, K, 0.03)
# corridor and side room: three wall-washers per wall, a soft fill overhead
spot("CorridorWash", (15.3, 7.6, H_A - 0.02), (14.0, 7.6, 1.0), 110, 60, 0.8, K, 0.03)
ROOM_WASH = [((RX0 + 1.0, y), (RX0, y)) for y in (10.6, 12.5, 14.4)] \
    + [((x, RY1 - 1.0), (x, RY1)) for x in (ROOM_CX - 2.2, ROOM_CX, ROOM_CX + 2.2)] \
    + [((RX1 - 1.0, y), (RX1, y)) for y in (10.6, 12.5, 14.4)] \
    + [((x, RY0 + 1.0), (x, RY0)) for x in (RX0 + 1.1, RX1 - 1.1)]
for i, ((px, py), (tx, ty)) in enumerate(ROOM_WASH):
    spot(f"RoomWash{i}", (px, py, H_A - 0.02), (tx, ty, 1.2), 200, 60, 0.8, K, 0.03)
    disk(f"RoomCan{i}", G_ROOM, M["emit_lens"], 0.04,
         Matrix.Translation((px, py, H_A - 0.001)) @ Matrix.Rotation(math.pi, 4, "X"), 16)
area("FillRoom", (ROOM_CX, ROOM_CY, H_A - 0.05), (ROOM_CX, ROOM_CY, 0.0), 240, 5.0, 5.0, 3000)
# frame B: linear strips + wall washers
for i, u in enumerate(STRIPS_U):
    for vv in (-3.0, 2.0):
        area(f"StripLight{i}_{vv}", B(u, vv, H_B - 0.03), B(u, vv, 0.0), 70, 0.08, 4.5, 3200, angle_z=B_ANGLE)
for i, u in enumerate([0.8, 2.4, 4.0, 6.6, 8.0]):
    spot(f"BlackWash{i}", B(u, -0.5, H_B - 0.02), B(u, -0.02, 0.8), 140, 55, 0.8, KB, 0.03)
# fewer, broader scallops along the beige wall, as in the reference
for i, u in enumerate([x + DU for x in (7.2, 8.8, 10.4, 12.0, 13.6, 15.2)]):
    spot(f"ArtWash{i}", B(u, ART_V - 0.6, H_B - 0.02), B(u, ART_V, 0.9), 240, 70, 0.8, KB, 0.03)
    disk(f"ArtCan{i}", G_WALL_B, M["emit_lens"], 0.04,
         FB @ Matrix.Translation((u, ART_V - 0.55, H_B - 0.001)) @ Matrix.Rotation(math.pi, 4, "X"), 16)
spot("ArtFocus", B(8.7 + DU, 2.6, H_B - 0.05), B(8.7 + DU, ART_V, 1.42), 60, 30, 0.6, KB, 0.05)
# artworks: a ceiling spot per work (or per column of a stacked group), aimed
# 30 degrees off vertical, the museum standard that keeps glare off the surface
ACCENT_W = 220          # watts at 2.4 m; scaled with distance so every work reads alike
CAN_GROUP = {"pier": G_WALL_A, "corr_s": G_WALL_A, "curtain": G_WALL_A, "vol": G_WALL_B, "vol_w": G_WALL_B,
             "beige": G_WALL_B, "beige_x": G_WALL_B, "vault_back": G_VAULT}
accents = []
for wid, wall, s_, zc, w, h, *_ in WORKS:
    if w > 2.2:     # the widest canvases take two overlapping beams
        accents += [(wall, s_ - w / 4, zc, w / 2 + 0.1, h), (wall, s_ + w / 4, zc, w / 2 + 0.1, h)]
    else:
        accents.append((wall, s_, zc, w, h))
for i, (wall, s_, zc, w, h) in enumerate(accents):
    F = wall_frame(wall, s_)
    ceil = WALLS[wall][2]
    off = (ceil - zc) * math.tan(math.radians(30))
    L = math.hypot(off, ceil - zc)
    cone = 2 * math.degrees(math.atan(0.55 * math.hypot(w, h) / L)) + 6
    spot(f"ArtSpot{i}", tuple(F @ Vector((0, -off, ceil - 0.02))), tuple(F @ Vector((0, 0, zc))),
         ACCENT_W * (L / 2.4) ** 2, cone, 0.35, KB if wall in ("vol", "vol_w", "beige", "beige_x", "vault_back") else K,
         0.02)
    disk(f"ArtCan{i}", CAN_GROUP.get(wall, G_ROOM), M["emit_lens"], 0.035,
         F @ Matrix.Translation((0, -off, ceil - 0.001)) @ Matrix.Rotation(math.pi, 4, "X"), 16)
# the beige room has no strip lights under its black ceiling: soft fill instead
area("FillB", B(10.5 + DU, 1.0, H_B - 0.05), B(10.5 + DU, 1.0, 0.0), 420, 6.0, 4.0, 3100, angle_z=B_ANGLE)
area("FillB2", B(13.8 + DU, 0.5, H_B - 0.05), B(13.8 + DU, 0.5, 0.0), 250, 5.0, 5.0, 3100, angle_z=B_ANGLE)
area("FillVault", B(3.2, -2.5, H_B - 0.05), B(3.2, -2.5, 0.0), 120, 4.0, 3.0, 3000, angle_z=B_ANGLE)

scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0

# ============================================================ camera path
print("[build] camera path")
EYE = 1.55
FOV = 50           # vertical field of view, degrees (Blender camera and website)
# The walk stops at every work: the camera arrives square on to it, far enough
# back that the whole work and a margin fill the view, and holds there for a
# stretch of scroll while it drifts a few centimetres (so the stop never feels
# frozen), before moving on. Times are written on a 0..WALK scale and divided
# by WALK; the hero's scroll height grows with WALK (path.json "walk").
WALK = 2.10
HALF_V = math.radians(FOV / 2)
HALF_H = math.radians(31)     # half the width of view on a fairly narrow (4:3) screen
WORK_BY_ID = {w[0]: w for w in WORKS}


def P(t):
    return round(t / WALK, 4)


MARGIN = 1.85                # the work fills about half the view, with wall around it


def art_view(wid, slide=0.0, d=None):
    """Camera square on to a work: on its centre line, eye height, far enough
    back that the work fills about half the view; slide moves along the wall."""
    _, wall, s_, zc, w, h, *_ = WORK_BY_ID[wid]
    F = wall_frame(wall, s_)
    d = d or max(h * MARGIN / 2 / math.tan(HALF_V), w * MARGIN / 2 / math.tan(HALF_H))
    pos = F @ Vector((slide, -d, 0))
    return (pos.x, pos.y, EYE), tuple(F @ Vector((0, 0, zc)))


def key(t, pos, target):
    return {"p": P(t), "pos": tuple(pos), "target": tuple(target)}


labels = []


def hold(t0, t1, a, b, works=()):
    """Two keys a short way apart in space but a long way apart in scroll; the
    works in view share one caption on the website for the length of the hold."""
    if works:
        labels.append({"works": list(works), "range": [P(t0), P(t1)]})
    return [key(t0, *a), key(t1, *b)]


def single(t0, t1, wid, drift=0.1, d=None):
    return hold(t0, t1, art_view(wid, -drift, d), art_view(wid, drift, d), works=[wid])


VAULT_VIEW = tuple(B(VAULT_U, CH_V1, 1.65))
keys = [
    key(0.00, (-1.0, -0.4, EYE), (-0.7, 6.0, 1.38)),
    key(0.08, (-0.5, -0.3, EYE), (-0.1, 6.0, 1.38)),
    key(0.20, (4.0, 0.1, EYE), (5.4, 6.0, 1.42)),
    *single(0.30, 0.38, "curtain", 0.15),
    *single(0.45, 0.51, "pier"),
    # round the pier's corner into the corridor (whose far wall limits how far
    # back the camera can stand for this work and the black wall's later)
    key(0.56, (14.6, 5.3, EYE), art_view("corridor")[1]),
    *single(0.60, 0.65, "corridor", 0.06, d=2.8),
    # through the doorway: the back wall's canvas, then each wall in turn
    key(0.70, (ROOM_CX, 9.6, EYE), (ROOM_CX, RY1, 1.75)),
    *hold(0.75, 0.81, art_view("centre", d=5.1), art_view("centre", d=4.8), works=["centre"]),
    *hold(0.86, 0.92, ((17.2, 12.35, EYE), (RX0, 12.5, 1.7)), ((17.3, 12.65, EYE), (RX0, 12.5, 1.7)),
          works=["west_0", "west_1"]),
    # (glance back at the centre so the view never swings through the camera)
    key(0.955, (15.6, 12.4, EYE), (15.6, RY1, 1.7)),
    *single(0.99, 1.05, "east"),
    *hold(1.10, 1.16, ((15.1, 15.55, EYE), (15.12, RY0, 1.7)), ((15.15, 15.3, EYE), (15.12, RY0, 1.7)),
          works=["door_l", "door_r"]),
    # out through the doorway to the black volume's end wall
    key(1.22, (ROOM_CX, 9.6, EYE), (14.8, 7.0, 1.5)),
    *single(1.27, 1.32, "vol_w", 0.06, d=2.3),
    # wide round the pier and the volume's corner into frame B
    key(1.37, (14.9, 6.0, EYE), (13.4, 2.5, 1.5)),
    key(1.41, (13.5, 4.3, EYE), (13.6, -1.0, 1.5)),
    *single(1.47, 1.52, "vol_l"),
    # out past the open door's edge, then square on to the vault: the three
    # gilded works fill the round opening
    key(1.545, tuple(B(2.3, -4.6, EYE)), tuple(B(4.2, 3.6, 1.6))),
    *hold(1.59, 1.67, (tuple(B(4.6, -4.6, EYE)), VAULT_VIEW), (tuple(B(4.85, -4.35, EYE)), VAULT_VIEW),
          works=["vault_l", "vault_c", "vault_r"]),
    *single(1.72, 1.77, "vol_r", 0.08),
    # into the beige room: turn to the volume's beige end, then the sideboard
    key(1.82, tuple(B(10.2, -2.2, EYE)), tuple(B(10.0, 2.5, 1.6))),
    *single(1.87, 1.92, "beige_x"),
    *hold(1.97, 2.02, (tuple(B(10.6, 0.6, EYE)), tuple(B(10.95, ART_V, 1.55))),
          (tuple(B(10.8, 0.65, EYE)), tuple(B(10.95, ART_V, 1.55)))),
    # last: the blue colour field
    *single(2.06, 2.10, "beige_field", 0.06),
]
assert all(a["p"] < b["p"] for a, b in zip(keys, keys[1:]))
# the last label stays up to the end of the walk
labels[-1]["range"][1] = 1.01
hotspots = [
    {"id": "materials", "label": "Material library", "pos": (-2.12, 5.84, 1.08), "range": [P(0.0), P(0.2)]},
    {"id": "curtains", "label": "Textile wall", "pos": (6.6, 5.8, 1.6), "range": [P(0.18), P(0.27)]},
    {"id": "room", "label": "Gallery room", "pos": (ROOM_CX, RY1 - 0.05, 2.0), "range": [P(0.7), P(0.74)]},
    {"id": "vault", "label": "The vault", "pos": tuple(B(VAULT_U + 0.3, 0.6, VAULT_Z)), "range": [P(1.55), P(1.7)]},
    {"id": "lamp", "label": "Lighting", "pos": tuple(B(LAMP[0], LAMP[1] - 0.1, LAMP[2] + 0.36)), "range": [P(1.94), P(2.03)]},
]


def credit(wid):
    artist, title, year, medium = CREDITS[wid]
    _, _, _, _, w, h, *_ = WORK_BY_ID[wid]
    return {"artist": artist, "title": title, "year": year, "medium": medium,
            "size": f"{round(w * 100)} \u00d7 {round(h * 100)} cm"}


# the Rooms menu's stops, and where the rooms turn light (the nav tab appears)
rooms = [("Material library", 0.0), ("Textile wall", 0.34), ("Gallery room", 0.78), ("The vault", 1.63),
         ("Exhibition hall", 1.995)]
BRIGHT_FROM = 1.8
# Only write the website's path when asked: while the rooms are being designed
# the live site keeps the path that matches its baked model.
WRITE_WEB = "--web" in sys.argv

os.makedirs(WEB_DATA, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "camera_keys.json"), "w") as f:
    json.dump({"keys": [{"p": k["p"], "pos": list(k["pos"]), "target": list(k["target"])} for k in keys]}, f, indent=1)
path_data = {
    "fov": FOV,
    "walk": WALK,
    "brightFrom": P(BRIGHT_FROM),
    "rooms": [{"label": label, "p": P(t)} for label, t in rooms],
    "keys": [{"p": k["p"], "pos": to_three(k["pos"]), "target": to_three(k["target"])} for k in keys],
    "hotspots": [{**h, "pos": to_three(h["pos"])} for h in hotspots],
    # captions: who made the work(s) in view, shown while the camera holds there
    "labels": [{"id": "-".join(lb["works"]), "range": lb["range"], "works": [credit(wid) for wid in lb["works"]]}
               for lb in labels],
    # the vault door's hinge and swing, and where its smoke comes out; it opens
    # as the camera reaches the landscape beside it, so the smoke has cleared
    # by the time the view lines up with the opening
    "vault": {
        "hinge": to_three(tuple(B(*HINGE))),
        "openDeg": DOOR_OPEN,
        "mouth": to_three(tuple(B(VAULT_U, 0.05, VAULT_Z))),
        "out": to_three(tuple(FB.to_3x3() @ Vector((0, -1, 0)))),
        "radius": VAULT_R,
        "openFrom": P(1.43),
        "openTo": P(1.78),
    },
}
with open(os.path.join(WEB_DATA if WRITE_WEB else OUT, "path.json"), "w") as f:
    json.dump(path_data, f, indent=1)

cam = bpy.data.cameras.new("Cam")
cam.sensor_fit = "VERTICAL"
cam.angle_y = math.radians(FOV)
cam.clip_start = 0.05
cam_ob = bpy.data.objects.new("Cam", cam)
scene.collection.objects.link(cam_ob)
scene.camera = cam_ob

# render defaults
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.0

counts = {c.name: len(c.objects) for c in bpy.data.collections}
print("[build] collections", counts)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("[build] saved", BLEND)
