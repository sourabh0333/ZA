"""Bakes lighting into per-group lightmaps and renders reflection panoramas.

Run: blender -b scene/out/gallery.blend -P scene/bake.py -- [--samples 256] [--only group,group] [--scale 1.0]

For every bake group the meshes are joined, given a second UV set ("Lightmap"),
and Cycles bakes diffuse direct + indirect light (no albedo) into a float image.
The image is denoised with OpenImageDenoise and stored for the web as an 8-bit
sRGB WebP scaled by a per-map intensity, recorded in lightmaps.json.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.paths import BAKED_BLEND, OUT, WEB_DATA, WEB_PUBLIC  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = {"samples": 256, "only": None, "scale": 1.0, "env": True}
i = 0
while i < len(argv):
    if argv[i] == "--samples":
        opts["samples"] = int(argv[i + 1]); i += 2
    elif argv[i] == "--only":
        opts["only"] = argv[i + 1].split(","); i += 2
    elif argv[i] == "--scale":
        opts["scale"] = float(argv[i + 1]); i += 2
    elif argv[i] == "--no-env":
        opts["env"] = False; i += 1
    else:
        i += 1

GROUPS = {
    "floor_a": 2048, "walls_a": 2048, "library": 2048, "furniture_a": 2048,
    "floor_b": 2048, "walls_b": 2048, "vault": 1024, "furniture_b": 2048,
    "room": 2048, "art": 2048,
}
FRAME_OF = {"floor_a": "a", "walls_a": "a", "library": "a", "furniture_a": "a",
            "floor_b": "b", "walls_b": "b", "vault": "b", "furniture_b": "b",
            "room": "a", "art": "a"}

BAKE_DIR = os.path.join(OUT, "bake")
LM_DIR = os.path.join(WEB_PUBLIC, "lightmaps")
for d in (BAKE_DIR, LM_DIR, WEB_DATA):
    os.makedirs(d, exist_ok=True)

scene = bpy.context.scene
main_scene = scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = opts["samples"]
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 0
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
bake = scene.render.bake
bake.use_pass_direct = True
bake.use_pass_indirect = True
bake.use_pass_color = False
bake.margin = 8
bake.margin_type = "EXTEND"
bake.use_clear = True
bake.target = "IMAGE_TEXTURES"


def ctx(obs, active):
    return bpy.context.temp_override(object=active, active_object=active,
                                     selected_objects=obs, selected_editable_objects=obs)


def joined(name):
    """Joins a bake group's meshes into one object (idempotent)."""
    coll = bpy.data.collections[name]
    meshes = [o for o in coll.objects if o.type == "MESH"]
    if len(meshes) == 1 and meshes[0].name == name:
        return meshes[0]
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in meshes:
        o.select_set(True)
    active = meshes[0]
    bpy.context.view_layer.objects.active = active
    with ctx(meshes, active):
        bpy.ops.object.join()
    active.name = name
    active.data.name = name
    return active


def lightmap_uv(ob, size):
    me = ob.data
    if "Lightmap" in me.uv_layers:
        return
    lm = me.uv_layers.new(name="Lightmap")
    me.uv_layers.active = lm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    margin = (3.0 if ob.name == "library" else 6.0) / size
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin,
                             area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")
    me.uv_layers.active = me.uv_layers["UVMap"]
    me.uv_layers["UVMap"].active_render = True


def bake_group(name, size):
    ob = joined(name)
    lightmap_uv(ob, size)
    img = bpy.data.images.get(f"lm_{name}") or bpy.data.images.new(f"lm_{name}", size, size, float_buffer=True, alpha=False)
    img.colorspace_settings.name = "Linear Rec.709"
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.get("LM_TARGET") or nt.nodes.new("ShaderNodeTexImage")
        node.name = "LM_TARGET"
        node.image = img
        nt.nodes.active = node
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t0 = time.time()
    with ctx([ob], ob):
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer="Lightmap",
                            margin=8, margin_type="EXTEND", use_clear=True, target="IMAGE_TEXTURES")
    print(f"[bake] {name} {size}px {opts['samples']}spp in {time.time() - t0:.0f}s", flush=True)
    raw = os.path.join(BAKE_DIR, f"lm_{name}_raw.exr")
    img.filepath_raw = raw
    img.file_format = "OPEN_EXR"
    img.save()
    return ob, img


# ---------------------------------------------------------------- denoising

def denoise(path_in, path_out, size):
    """OpenImageDenoise through the compositor of a throwaway scene."""
    sc = bpy.data.scenes.get("Denoise") or bpy.data.scenes.new("Denoise")
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    sc.view_settings.view_transform = "Standard"
    sc.display_settings.display_device = "sRGB"
    if sc.camera is None:
        cam = bpy.data.objects.new("DenoiseCam", bpy.data.cameras.new("DenoiseCam"))
        sc.collection.objects.link(cam)
        sc.camera = cam
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    src = nt.nodes.new("CompositorNodeImage")
    src.image = bpy.data.images.load(path_in, check_existing=False)
    dn = nt.nodes.new("CompositorNodeDenoise")
    dn.use_hdr = True
    dn.prefilter = "ACCURATE"
    comp = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(src.outputs["Image"], dn.inputs["Image"])
    nt.links.new(dn.outputs["Image"], comp.inputs["Image"])
    sc.render.filepath = path_out
    with bpy.context.temp_override(scene=sc):
        bpy.ops.render.render(write_still=True, scene=sc.name)
    bpy.data.images.remove(src.image)
    out = bpy.data.images.load(path_out, check_existing=False)
    return out


def encode_web(img, name):
    """float lightmap -> 8-bit sRGB WebP of (value / scale)."""
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    rgb = a.reshape(h, w, 4)[..., :3]
    peak = rgb.max(axis=2)
    lit = peak[peak > 1e-5]
    scale = float(np.percentile(lit, 99.7)) if lit.size else 1.0
    scale = max(scale, 1e-3)
    v = np.clip(rgb / scale, 0, 1)
    s = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(f"web_{name}", w, h, alpha=False, float_buffer=False)
    out.colorspace_settings.name = "Non-Color"
    px = np.concatenate([s, np.ones((h, w, 1), np.float32)], axis=2)
    out.pixels.foreach_set(px.astype(np.float32).ravel())
    path = os.path.join(LM_DIR, f"{name}.webp")
    out.filepath_raw = path
    out.file_format = "WEBP"
    out.save()
    bpy.data.images.remove(out)
    return path, scale


# ----------------------------------------------------------- reflection maps

def panorama(name, pos):
    sc = main_scene
    cam_data = bpy.data.cameras.new(f"Pano_{name}")
    cam_data.type = "PANO"
    cam_data.panorama_type = "EQUIRECTANGULAR"
    cam = bpy.data.objects.new(f"Pano_{name}", cam_data)
    sc.collection.objects.link(cam)
    cam.location = pos
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    prev = sc.camera
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1024, 512
    sc.render.resolution_percentage = 100
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.image_settings.file_format = "HDR"
    sc.view_settings.view_transform = "Standard"
    path = os.path.join(WEB_PUBLIC, f"env_{name}.hdr")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    sc.camera = prev
    sc.cycles.use_denoising = False
    sc.cycles.samples = opts["samples"]
    sc.view_settings.view_transform = "AgX"
    print("[bake] panorama", path, flush=True)


# ----------------------------------------------------------------- run

manifest_path = os.path.join(WEB_DATA, "lightmaps.json")
manifest = {}
if os.path.exists(manifest_path):
    with open(manifest_path) as f:
        manifest = json.load(f)

# the vault door moves on the website, so it must not leave a baked shadow
for ob in bpy.data.objects:
    if ob.get("door"):
        ob.hide_render = True

# join + UV every group first so all groups share final geometry
for name, size in GROUPS.items():
    lightmap_uv(joined(name), size)

for name, size in GROUPS.items():
    if opts["only"] and name not in opts["only"]:
        continue
    size = int(size * opts["scale"])
    ob, img = bake_group(name, size)
    den_path = os.path.join(BAKE_DIR, f"lm_{name}.exr")
    den = denoise(img.filepath_raw, den_path, size)
    path, scale = encode_web(den, name)
    bpy.data.images.remove(den)
    manifest[name] = {"file": f"/gallery/lightmaps/{name}.webp", "intensity": round(scale, 5),
                      "env": FRAME_OF[name], "size": size}
    ob["lightmap"] = name
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"[bake] wrote {path} scale={scale:.4f}", flush=True)

if opts["env"] and not opts["only"]:
    panorama("a", (3.0, 1.5, 1.6))
    fb_pos = Vector((14.0, 3.5, 0.0)) + Vector((math.cos(math.radians(-40)), math.sin(math.radians(-40)), 0)) * 6.0 \
        + Vector((-math.sin(math.radians(-40)), math.cos(math.radians(-40)), 0)) * -1.0
    panorama("b", (fb_pos.x, fb_pos.y, 1.6))

for name in GROUPS:
    ob = bpy.data.objects.get(name)
    if ob is not None:
        ob["lightmap"] = name
bpy.ops.wm.save_as_mainfile(filepath=BAKED_BLEND)
print("[bake] saved", BAKED_BLEND, flush=True)
