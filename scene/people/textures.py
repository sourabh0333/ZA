"""Converts the cast's Rocketbox textures (2048 px TGA) to PNG for bake.html.

  python3 scene/people/textures.py <rocketbox Assets dir> [id ...]

Writes scene/out/people/tex/<avatar>/: colour and normal maps as they are,
and the specular map turned into a glTF roughness map (in G), so skin, hair
and cloth catch the light differently. bake.mjs resizes and compresses later.
"""
import json
import os
import sys

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "people", "tex")


def convert(src, out):
    os.makedirs(out, exist_ok=True)
    for name in sorted(os.listdir(src)):
        stem, ext = os.path.splitext(name)
        # (the wrinkle normals are for facial animation, which the gallery doesn't use)
        if ext.lower() != ".tga" or "wrinkle" in stem or " - " in stem:
            continue
        kind = stem.split("_", 1)[1]  # body_color, head_normal, opacity_color, ...
        im = Image.open(os.path.join(src, name))
        if kind.endswith("specular"):
            # shiny where the specular map is bright; never fully matte or mirror-like
            g = ImageOps.grayscale(im)
            r = g.point(lambda v: int(255 * (0.92 - 0.55 * (v / 255) ** 0.8)))
            white, black = Image.new("L", r.size, 255), Image.new("L", r.size, 0)
            Image.merge("RGB", (white, r, black)).save(os.path.join(out, kind.replace("specular", "rough") + ".png"))
        elif kind.startswith("opacity"):
            # hair and lashes: fine at half the size of the clothes and skin
            im.convert("RGBA").resize((512, 512), Image.LANCZOS).save(os.path.join(out, kind + ".png"))
        else:
            im.convert("RGB").save(os.path.join(out, kind + ".png"))


if __name__ == "__main__":
    assets = sys.argv[1]
    only = sys.argv[2:]
    cast = [p for p in json.load(open(os.path.join(HERE, "cast.json")))["people"] if not only or p["id"] in only]
    for avatar in sorted({p["avatar"] for p in cast}):
        convert(os.path.join(assets, "Avatars", "Adults", avatar, "Textures"), os.path.join(OUT, avatar))
        print("textures", avatar)
