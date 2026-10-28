"""Texture preparation: tints, recolours and resizes the CC0 source maps.

Every material gets its own albedo/normal/roughness files in scene/cache/tex so
that Blender (for the bake) and the website (for rendering) use the same pixels.
"""
import os
import bpy
import numpy as np

from .paths import ASSETS, CACHE

TEX_OUT = os.path.join(CACHE, "tex")


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def load(path, size, colorspace="sRGB"):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = colorspace
    if size and tuple(img.size) != (size, size):
        img.scale(size, size)
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)


def save(arr, path, fmt="JPEG"):
    """Writes an (h, w, 3|4) array of display-encoded values to disk unchanged."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], axis=2)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = fmt
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save()
    bpy.data.images.remove(img)


def src(tex_id, kind):
    return os.path.join(ASSETS, "textures", tex_id, f"{kind}.jpg")


def luminance(lin):
    return lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722


def tinted_albedo(tex_id, tint=(1, 1, 1), gain=1.0, contrast=1.0, size=1024, sat=1.0, target=None):
    """target: desired mean linear luminance after tinting (overrides gain)."""
    rgb = srgb_to_lin(load(src(tex_id, "Diffuse"), size)[..., :3])
    if sat != 1.0:
        lum = luminance(rgb)[..., None]
        rgb = lum + (rgb - lum) * sat
    if target is not None:
        tinted = rgb * np.array(tint, np.float32)
        gain = target / max(1e-6, float(luminance(tinted).mean()))
    if contrast != 1.0:
        mean = rgb.mean(axis=(0, 1), keepdims=True)
        rgb = mean + (rgb - mean) * contrast
    rgb = rgb * np.array(tint, np.float32) * gain
    return lin_to_srgb(rgb)


def remap_albedo(tex_id, dark, light, gamma=1.0, size=1024):
    """Recolours a texture by its luminance (e.g. white marble -> green marble)."""
    lin = srgb_to_lin(load(src(tex_id, "Diffuse"), size)[..., :3])
    lum = luminance(lin)
    lum = (lum - lum.min()) / max(1e-6, lum.max() - lum.min())
    lum = lum[..., None] ** gamma
    rgb = np.array(dark, np.float32) + (np.array(light, np.float32) - np.array(dark, np.float32)) * lum
    return lin_to_srgb(rgb)


def roughness(tex_id, mult=1.0, add=0.0, size=1024):
    r = load(src(tex_id, "Rough"), size, "Non-Color")[..., :3]
    return np.clip(r * mult + add, 0.02, 1.0)


def normal(tex_id, size=1024):
    return load(src(tex_id, "nor_gl"), size, "Non-Color")[..., :3]


def _blur(a, sigma_px):
    """Gaussian blur through the FFT (wraps at the edges, fine for noise)."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma_px) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape).astype(np.float32)


def noise(rng, h, w, sigma_px):
    """Smooth zero-mean, unit-variance noise with features about sigma_px wide."""
    n = _blur(rng.standard_normal((h, w)).astype(np.float32), sigma_px)
    n -= n.mean()
    return n / max(1e-6, n.std())


def curtain_albedo(h=1024, w=2048, seed=7):
    """Dark bronze velvet across the whole curtain (UVs span its full width):
    each pleat a slightly different umber, bronze or gold, with two broad
    golden zones toward the ends, as in the reference."""
    rng = np.random.default_rng(seed)
    palette = np.array([
        (0.05, 0.034, 0.022), (0.11, 0.07, 0.038), (0.24, 0.15, 0.07),
        (0.42, 0.29, 0.14), (0.6, 0.45, 0.24),
    ], np.float32)
    weights = np.array([0.34, 0.26, 0.2, 0.13, 0.07])
    cols = np.zeros((w, 3), np.float32)
    x = 0
    while x < w:
        bw = int(rng.integers(w // 160, w // 55))
        cols[x:x + bw] = palette[rng.choice(len(palette), p=weights)] * rng.uniform(0.85, 1.12)
        x += bw
    k = np.ones(5, np.float32) / 5
    for c in range(3):
        cols[:, c] = np.convolve(np.concatenate([cols[-4:, c], cols[:, c], cols[:4, c]]), k, "same")[4:-4]
    u = np.linspace(0, 1, w, dtype=np.float32)
    zone = 0.75 + 0.55 * np.exp(-((u - 0.18) / 0.13) ** 2) + 0.6 * np.exp(-((u - 0.86) / 0.11) ** 2) \
        - 0.25 * np.exp(-((u - 0.55) / 0.12) ** 2)
    velvet = srgb_to_lin(load(src("velour_velvet", "Diffuse"), h)[..., :3])
    velvet = np.concatenate([velvet] * (w // h), axis=1)
    lum = luminance(velvet)
    detail = (0.8 + 0.4 * (lum / max(1e-6, lum.mean()) - 1.0) * 0.6)[..., None]
    # sheen falls off slightly toward the floor
    v = np.linspace(0.85, 1.0, h, dtype=np.float32)[:, None, None]
    rgb = cols[None, :, :] * zone[None, :, None] * detail * v
    return lin_to_srgb(rgb)


def artwork_albedo(w=2048, h=1004, seed=3):
    """The beige room's canvas: a smoky grey-green panel on the left third, then
    a pale ground clouded with amber and gold smoke toward the right."""
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    smoke = 0.55 * noise(rng, h, w, h / 7) + 0.3 * noise(rng, h, w, h / 22) + 0.15 * noise(rng, h, w, h / 70)
    swirl = np.clip(0.5 + 0.35 * smoke, 0, 1)
    left = np.array((0.07, 0.08, 0.072), np.float32) + swirl[..., None] * np.array((0.1, 0.105, 0.09), np.float32)
    pale = np.array((0.3, 0.27, 0.22), np.float32) + swirl[..., None] * np.array((0.26, 0.22, 0.16), np.float32)
    amber = np.array((0.42, 0.25, 0.1), np.float32) * (0.45 + 0.9 * swirl[..., None])
    gold = np.clip((x - 0.5) * 2.0 + smoke * 0.55 - np.abs(y - 0.45) * 0.3, 0, 1)[..., None]
    right = pale * (1 - gold * 0.8) + amber * gold * 0.8
    edge = np.clip((x - 0.33) * 60 + 0.5, 0, 1)[..., None]
    seam = (1 - 0.6 * np.exp(-((x - 0.33) / 0.002) ** 2))[..., None]
    rgb = (left * (1 - edge) + right * edge) * seam
    return lin_to_srgb(rgb)


def speckled_stone(size=512, seed=9):
    """Black granite/terrazzo with dense white and grey chips (the library
    panel's large swatch)."""
    rng = np.random.default_rng(seed)
    base = 0.012 + 0.01 * np.clip(noise(rng, size, size, 6) * 0.5 + 0.5, 0, 1)
    rgb = np.ones((size, size, 3), np.float32) * base[..., None]
    for level, density, blur in ((0.55, 0.012, 1.2), (0.22, 0.02, 1.6), (0.8, 0.004, 0.9)):
        chips = (rng.random((size, size)) < density).astype(np.float32)
        chips = np.clip(_blur(chips, blur) * 14.0, 0, 1)
        rgb = rgb * (1 - chips[..., None]) + level * chips[..., None]
    return lin_to_srgb(rgb)


def verde_marble(size=1024, seed=21):
    """Verde Alpi style marble: deep green with darker clouds and branching
    white veins, generated so it never shows tile seams on the bench."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    turb = 0.6 * noise(rng, size, size, size / 9) + 0.3 * noise(rng, size, size, size / 28) \
        + 0.1 * noise(rng, size, size, size / 90)
    clouds = np.clip(0.5 + 0.3 * noise(rng, size, size, size / 14), 0, 1)
    base = np.array((0.008, 0.014, 0.011), np.float32) + clouds[..., None] * np.array((0.028, 0.045, 0.034), np.float32)
    veins = np.zeros((size, size), np.float32)
    for f, a, wdt in ((2.2, 1.0, 0.035), (4.7, 0.6, 0.02), (9.0, 0.35, 0.012)):
        band = np.abs(np.sin((xx * f + yy * f * 0.6 + turb * 1.4 * a) * np.pi))
        veins = np.maximum(veins, a * np.clip(1 - band / wdt, 0, 1))
    white = np.array((0.55, 0.6, 0.56), np.float32)
    rgb = base * (1 - veins[..., None]) + white * veins[..., None]
    return lin_to_srgb(rgb)


def solid(color_lin, size=8):
    return lin_to_srgb(np.ones((size, size, 3), np.float32) * np.array(color_lin, np.float32))


def write_set(name, albedo, rough=None, nrm=None):
    """Saves a material's maps; returns their paths."""
    out = {"albedo": os.path.join(TEX_OUT, f"{name}_albedo.jpg")}
    save(albedo, out["albedo"])
    if rough is not None:
        out["rough"] = os.path.join(TEX_OUT, f"{name}_rough.jpg")
        save(rough, out["rough"])
    if nrm is not None:
        out["normal"] = os.path.join(TEX_OUT, f"{name}_normal.jpg")
        save(nrm, out["normal"])
    return out
