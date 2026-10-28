"""Renders the hero poster (first frame of the walk) used before WebGL is ready.

Run: blender -b scene/out/gallery.blend -P scene/poster.py
Writes scene/out/poster.png; scene/tools/poster.mjs converts it to WebP.
"""
import json
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.camera_path import sampler  # noqa: E402
from lib.paths import OUT  # noqa: E402

with open(os.path.join(OUT, "camera_keys.json")) as f:
    sample = sampler(json.load(f)["keys"])

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 128
scene.cycles.use_denoising = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
pos, tgt = sample(0.0)
cam = scene.camera
cam.location = pos
cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = os.path.join(OUT, "poster.png")
bpy.ops.render.render(write_still=True)
print("[poster]", scene.render.filepath)
