"""Exports the baked scene to glTF for the website.

Run: blender -b scene/out/gallery_baked.blend -P scene/export.py
     blender -b scene/out/gallery.blend -P scene/export.py -- --preview   (unbaked, for a quick look)
Then: node scene/tools/optimize.mjs   (meshopt + texture compression)
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.paths import OUT  # noqa: E402

PREVIEW = "--preview" in sys.argv
RAW = os.path.join(OUT, "gltf", "gallery.gltf")
os.makedirs(os.path.dirname(RAW), exist_ok=True)

for ob in list(bpy.data.objects):
    if ob.type != "MESH":
        bpy.data.objects.remove(ob)
for sc in list(bpy.data.scenes):
    if sc.name == "Denoise":
        bpy.data.scenes.remove(sc)
for mat in bpy.data.materials:
    if mat.node_tree and "LM_TARGET" in mat.node_tree.nodes:
        mat.node_tree.nodes.remove(mat.node_tree.nodes["LM_TARGET"])

# the vault door is animated on the web, so it is lit live rather than baked
missing = [o.name for o in bpy.data.objects if "lightmap" not in o and not o.get("door")]
if missing and not PREVIEW:
    raise SystemExit(f"objects without a baked lightmap: {missing}")


def keep_lightmap_uvs():
    """The exporter only writes UV maps a material samples. Route a 4x4 white
    placeholder through the glTF occlusion slot on the "Lightmap" UV so that
    TEXCOORD_1 is exported; optimize.mjs removes the placeholder afterwards."""
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng is None:
        ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    white = bpy.data.images.new("lm_uv_placeholder", 4, 4, alpha=False)
    white.pixels.foreach_set([1.0] * 64)
    white.filepath_raw = os.path.join(OUT, "gltf", "lm_uv_placeholder.png")
    white.file_format = "PNG"
    white.save()
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.get("web", {}).get("emissive"):
            continue
        nt = mat.node_tree
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = "Lightmap"
        img = nt.nodes.new("ShaderNodeTexImage")
        img.image = white
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        out = nt.nodes.new("ShaderNodeGroup")
        out.node_tree = ng
        nt.links.new(uv.outputs["UV"], img.inputs["Vector"])
        nt.links.new(img.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Red"], out.inputs["Occlusion"])


if not PREVIEW:
    keep_lightmap_uvs()

bpy.ops.export_scene.gltf(
    filepath=RAW,
    export_format="GLTF_SEPARATE",
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_extras=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
print("[export] wrote", RAW)
