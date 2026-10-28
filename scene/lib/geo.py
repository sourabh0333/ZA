"""Geometry, material and light helpers. All meshes are built in world space."""
import math
import random
import bpy
import bmesh
from mathutils import Matrix, Vector

UV0 = "UVMap"

# ---------------------------------------------------------------- collections

def group(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def link(ob, grp):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    group(grp).objects.link(ob)
    ob["bake_group"] = grp
    return ob


# ------------------------------------------------------------------ materials

def _img(path, colorspace):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def material(name, maps=None, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0,
             normal_strength=0.6, emission=None, emission_strength=0.0, web=None):
    """Principled material. `maps` holds albedo/rough/normal file paths.

    `web` is stored as a custom property and read by the website (envMap
    intensity, emissive handling, etc.).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    maps = maps or {}
    if maps:
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = UV0
    if "albedo" in maps:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(maps["albedo"], "sRGB")
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if "rough" in maps:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(maps["rough"], "Non-Color")
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], bsdf.inputs["Roughness"])
    if "normal" in maps:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _img(maps["normal"], "Non-Color")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat["web"] = web or {}
    return mat


# --------------------------------------------------------------------- meshes

def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


def frame_matrix(origin, angle_deg):
    return Matrix.Translation(Vector(origin)) @ rot_z(angle_deg)


def box_uv(me, tile=1.0, angle_deg=0.0, offset=(0.0, 0.0)):
    """World-scale box projection, aligned to a frame rotated by angle_deg."""
    inv = rot_z(-angle_deg).to_3x3()
    uv = me.uv_layers.get(UV0) or me.uv_layers.new(name=UV0)
    ox, oy = offset
    for poly in me.polygons:
        n = inv @ poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            p = inv @ me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = (p.y if n.x > 0 else -p.y), p.z
            elif ax == 1:
                u, v = (-p.x if n.y > 0 else p.x), p.z
            else:
                u, v = p.x, (p.y if n.z > 0 else -p.y)
            uv.data[li].uv = (u / tile + ox, v / tile + oy)


def finish(bm, name, grp, mats, tile=1.0, angle=0.0, smooth=False, uv=True):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if uv:
        box_uv(me, tile, angle, (random.random(), random.random()))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return link(ob, grp)


def box(name, grp, mat, size, center, angle=0.0, frame=None, tile=1.0, face_mats=None, bevel=0.0):
    """Axis-aligned (in its frame) box. `center` is the bottom-centre point.

    face_mats maps '+x' '-x' '+y' '-y' '+z' '-z' (local directions) to materials.
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.normal_update()
    mats = [mat]
    if face_mats:
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            key = ("+" if n[ax] > 0 else "-") + "xyz"[ax]
            if key in face_mats:
                m = face_mats[key]
                if m not in mats:
                    mats.append(m)
                f.material_index = mats.index(m)
    sx, sy, sz = size
    m = Matrix.Diagonal((sx, sy, sz, 1))
    local = Matrix.Translation(Vector(center) + Vector((0, 0, sz / 2))) @ rot_z(angle) @ m
    world = (frame or Matrix.Identity(4)) @ local
    bmesh.ops.transform(bm, matrix=world, verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    total_angle = angle + (math.degrees(frame.to_euler().z) if frame else 0.0)
    return finish(bm, name, grp, mats, tile, total_angle)


def cylinder(name, grp, mat, radius, depth, matrix, segments=32, cap_mat=None, radius2=None, tile=1.0):
    """Cylinder along local Z, base at local origin, placed by `matrix`."""
    bm = bmesh.new()
    r2 = radius if radius2 is None else radius2
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=r2, depth=depth,
                          matrix=Matrix.Translation((0, 0, depth / 2)))
    mats = [mat]
    if cap_mat is not None:
        mats.append(cap_mat)
    for f in bm.faces:
        cap = abs(f.normal.z) > 0.9
        f.smooth = not cap
        if cap and cap_mat is not None and f.calc_center_median().z > depth * 0.9:
            f.material_index = 1
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(bm, name, grp, mats, tile)


def torus(name, grp, mat, major, minor, matrix, seg=48, ring=12, arc=360.0):
    bm = bmesh.new()
    closed = arc >= 359.9
    n_major = seg if closed else seg + 1
    rows = []
    for i in range(n_major):
        a = math.radians(arc) * i / seg
        ca, sa = math.cos(a), math.sin(a)
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            r = major + minor * math.cos(b)
            row.append(bm.verts.new((r * ca, r * sa, minor * math.sin(b))))
        rows.append(row)
    span = seg if closed else seg
    for i in range(span):
        a, b = rows[i], rows[(i + 1) % n_major]
        for j in range(ring):
            f = bm.faces.new((a[j], b[j], b[(j + 1) % ring], a[(j + 1) % ring]))
            f.smooth = True
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(bm, name, grp, [mat], 0.3)


def plane(name, grp, mat, w, h, matrix, tile=1.0):
    """XY plane of size w*h centred at local origin, facing +Z."""
    bm = bmesh.new()
    hw, hh = w / 2, h / 2
    vs = [bm.verts.new(p) for p in ((-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0))]
    bm.faces.new(vs)
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(bm, name, grp, [mat], tile)


def disk(name, grp, mat, radius, matrix, seg=32):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=seg, radius=radius)
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    return finish(bm, name, grp, [mat], 0.5)


def wall_quad(name, grp, mat, p0, p1, z0, z1, thickness=0.15, tile=2.0, angle=0.0):
    """Wall along the segment p0->p1 (2D), faces toward the left of the direction."""
    p0, p1 = Vector((*p0, 0)), Vector((*p1, 0))
    d = p1 - p0
    length = d.length
    yaw = math.degrees(math.atan2(d.y, d.x))
    mid = (p0 + p1) / 2
    nrm = Vector((-d.y, d.x, 0)).normalized()
    center = mid - nrm * (thickness / 2)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Translation(Vector((center.x, center.y, (z0 + z1) / 2))) @ rot_z(yaw) @ Matrix.Diagonal((length, thickness, z1 - z0, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return finish(bm, name, grp, [mat], tile, angle)


# --------------------------------------------------------------------- lights

def kelvin(k):
    """Approximate linear RGB for a colour temperature."""
    t = k / 100.0
    r = 255 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    # Display-referred tint used as a linear light colour, softened toward white:
    # interior LEDs read warm but not orange once the camera white-balances.
    srgb = [max(0, min(255, c)) / 255 for c in (r, g, b)]
    return tuple(0.3 + 0.7 * c for c in srgb)


def _aim(ob, pos, target):
    ob.location = pos
    d = Vector(target) - Vector(pos)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def spot(name, pos, target, power, size_deg=60, blend=0.5, k=2900, radius=0.03):
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = power
    ld.spot_size = math.radians(size_deg)
    ld.spot_blend = blend
    ld.color = kelvin(k)
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    group("lights").objects.link(ob)
    _aim(ob, pos, target)
    return ob


def point(name, pos, power, k=2900, radius=0.05):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = power
    ld.color = kelvin(k)
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    group("lights").objects.link(ob)
    ob.location = pos
    return ob


def area(name, pos, target, power, sx, sy, k=3000, angle_z=0.0):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = power
    ld.shape = "RECTANGLE"
    ld.size = sx
    ld.size_y = sy
    ld.color = kelvin(k)
    ob = bpy.data.objects.new(name, ld)
    group("lights").objects.link(ob)
    _aim(ob, pos, target)
    ob.rotation_euler.rotate_axis("Z", math.radians(angle_z))
    return ob
