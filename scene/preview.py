"""Renders preview stills along the camera path.

Run: blender -b scene/out/gallery.blend -P scene/preview.py -- 0 0.25 0.5 [--samples 24] [--width 640]
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector  # noqa: E402

from lib.camera_path import sampler  # noqa: E402
from lib.paths import OUT  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
samples, width = 24, 640
progress = []
i = 0
while i < len(argv):
    if argv[i] == "--samples":
        samples = int(argv[i + 1]); i += 2
    elif argv[i] == "--width":
        width = int(argv[i + 1]); i += 2
    else:
        progress.append(float(argv[i])); i += 1
progress = progress or [0.0, 0.22, 0.48, 0.62, 0.8, 1.0]

with open(os.path.join(OUT, "camera_keys.json")) as f:
    keys = json.load(f)["keys"]
sample = sampler(keys)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x = width
scene.render.resolution_y = int(width * 9 / 16)
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
cam = scene.camera
out_dir = os.path.join(OUT, "preview")
os.makedirs(out_dir, exist_ok=True)
for p in progress:
    pos, tgt = sample(p)
    cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(out_dir, f"p_{int(round(p * 100)):03d}.png")
    bpy.ops.render.render(write_still=True)
    print("[preview]", p, scene.render.filepath)
