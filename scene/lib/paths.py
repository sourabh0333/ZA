import os

SCENE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.dirname(SCENE)
ASSETS = os.path.join(SCENE, "assets")
CACHE = os.path.join(SCENE, "cache")
OUT = os.path.join(SCENE, "out")
BLEND = os.path.join(OUT, "gallery.blend")
BAKED_BLEND = os.path.join(OUT, "gallery_baked.blend")
WEB_DATA = os.path.join(PROJECT, "src", "components", "gallery", "data")
WEB_PUBLIC = os.path.join(PROJECT, "public", "gallery")
