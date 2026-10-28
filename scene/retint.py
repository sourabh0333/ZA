"""Regenerates the dark plaster albedos in place (surface colour only, no re-bake).

Run: blender -b --factory-startup -P scene/retint.py
Then re-run scene/export.py on the baked blend and scene/tools/optimize.mjs.
Keep these values in step with build_scene.py.
"""
import os
import sys

import bpy  # noqa: F401  (tex helpers need Blender's image API)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import tex  # noqa: E402

tex.save(tex.tinted_albedo("grey_plaster_02", (0.25, 0.22, 0.19), 1.0, 1.1),
         os.path.join(tex.TEX_OUT, "plaster_dark_albedo.jpg"))
tex.save(tex.tinted_albedo("grey_plaster_02", (0.045, 0.042, 0.04), 1.0, 0.9),
         os.path.join(tex.TEX_OUT, "plaster_black_albedo.jpg"))
print("[retint] done")
