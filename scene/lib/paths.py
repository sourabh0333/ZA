import os

# Which scene the scripts work on: the gallery (the home page's hero, the
# default) or the showroom (the products page's), set by ZA_SCENE=showroom.
NAME = os.environ.get("ZA_SCENE", "gallery")
SCENE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.dirname(SCENE)
ASSETS = os.path.join(SCENE, "assets")
CACHE = os.path.join(SCENE, "cache")
OUT = os.path.join(SCENE, "out") if NAME == "gallery" else os.path.join(SCENE, "out", NAME)
BLEND = os.path.join(OUT, f"{NAME}.blend")
BAKED_BLEND = os.path.join(OUT, f"{NAME}_baked.blend")
WEB_DATA = os.path.join(PROJECT, "src", "components", NAME, "data")
WEB_PUBLIC = os.path.join(PROJECT, "public", NAME)
