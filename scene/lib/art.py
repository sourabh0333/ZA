"""Procedural paintings and works on paper for the gallery walls.

Every work is generated from a style, a palette and a seed, so the collection
is reproducible and needs no image assets. Arrays are (h, w, 3) linear RGB with
row 0 at the bottom (Blender's image convention); `make` returns sRGB values
ready for tex.save. Shapes are drawn as signed distances with slightly wobbly,
soft edges and every flat colour carries a little tonal drift, so the works
read as painted rather than vector-drawn.
"""
import numpy as np

from .tex import lin_to_srgb, srgb_to_lin


def _hex(h):
    return srgb_to_lin(np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32))


# ground, four colours, a dark
PALETTES = {
    "terra": ["#E9DFCC", "#B4532F", "#D39B42", "#5A3524", "#8E9B7D", "#211D1A"],
    "ink": ["#EEE9DF", "#1B1A19", "#8A857D", "#A6361F", "#C9C2B5", "#121110"],
    "dusk": ["#EFE4D3", "#25324F", "#5B7899", "#E3AE89", "#C27F74", "#141A2A"],
    "olive": ["#E6DCC6", "#5F6B3B", "#C9B88F", "#9C4B25", "#38411F", "#1D1F14"],
    "noir": ["#2B2926", "#8E653C", "#C8A35E", "#6F6A63", "#D9CDB8", "#141312"],
    "sea": ["#E9E1CF", "#2E5B60", "#8DB6AE", "#D8735A", "#E2CDA5", "#132326"],
    "ochre": ["#EDE2CD", "#D2A33B", "#A4462C", "#E1B2A2", "#3F2B21", "#1C1512"],
    "rose": ["#F0E6DC", "#C98E86", "#7D3B3A", "#E9C9A9", "#4E5D6C", "#231B1C"],
}


def palette(name):
    return [_hex(c) for c in PALETTES[name]]


# ------------------------------------------------------------------ helpers

def _blur2(a, sx, sy):
    """Anisotropic Gaussian blur through the FFT (sigmas in pixels)."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * np.pi ** 2 * ((sx * fx) ** 2 + (sy * fy) ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape).astype(np.float32)


def _noise(rng, h, w, sx, sy=None):
    n = _blur2(rng.standard_normal((h, w)).astype(np.float32), sx, sx if sy is None else sy)
    n -= n.mean()
    return n / max(1e-6, n.std())


class Canvas:
    """Drawing surface in units of the work's height: x in [0, aspect], y in [0, 1]."""

    def __init__(self, w, h, rng, ground):
        self.w, self.h, self.rng = w, h, rng
        self.a = w / h
        self.x = ((np.arange(w, dtype=np.float32) + 0.5) / h)[None, :]
        self.y = ((np.arange(h, dtype=np.float32) + 0.5) / h)[:, None]
        self.px = 1.0 / h
        self.img = np.ones((h, w, 3), np.float32) * ground
        self.rough = None   # set by works with gold leaf, which is glossier than paint
        self.drift(ground, 0.05, 0.25)

    def noise(self, scale, sy=None):
        """Smooth noise with features about `scale` (in height units) wide."""
        return _noise(self.rng, self.h, self.w, scale * self.h, (sy or scale) * self.h)

    def drift(self, col, amount=0.08, scale=0.18):
        """Re-lays the ground with gentle cloudy variation."""
        n = 0.7 * self.noise(scale) + 0.3 * self.noise(scale / 4)
        self.img = np.ones_like(self.img) * col * (1 + amount * n)[..., None]

    def wobble(self, amount=0.004, scale=0.03):
        return amount * self.noise(scale)

    def fill(self, sd, col, soft=1.5, wob=0.004, var=0.06, opacity=1.0, scale=0.2, wscale=0.03):
        """Paints colour where the signed distance sd < 0."""
        if wob:
            sd = sd + self.wobble(wob, wscale)
        m = np.clip(0.5 - sd / (soft * self.px), 0, 1) * opacity
        c = col * (1 + var * self.noise(scale))[..., None] if var else col
        self.img = self.img * (1 - m[..., None]) + c * m[..., None]
        return m

    def glaze(self, m, col):
        self.img = self.img * (1 - m[..., None]) + col * m[..., None]

    def leaf(self, m, size=0.06):
        """Lays gold leaf where m > 0: square sheets of slightly different
        tone with fine seams and a little crackle, much smoother than paint."""
        gold = _hex("#C9A04E")
        cell_x = np.floor(self.x / size + 0.5 * (np.floor(self.y / size) % 2))
        cell_y = np.floor(self.y / size)
        h = np.sin(cell_x * 12.9898 + cell_y * 78.233) * 43758.5453
        tone = 0.82 + 0.3 * (h - np.floor(h))
        fx = np.abs(((self.x / size + 0.5 * (np.floor(self.y / size) % 2)) % 1) - 0.5)
        fy = np.abs(((self.y / size) % 1) - 0.5)
        seam = 1 - 0.35 * np.clip((np.maximum(fx, fy) - 0.485) / 0.015, 0, 1)
        crackle = 1 - 0.25 * np.clip(1 - np.abs(self.noise(0.01)) * 6, 0, 1)
        col = gold * (tone * seam * crackle)[..., None]
        self.glaze(m, col)
        if self.rough is None:
            self.rough = np.full(self.img.shape[:2], 0.78, np.float32)
        self.rough = self.rough * (1 - m) + (0.32 + 0.08 * self.noise(0.05)) * m

    def finish(self, grain=0.025, canvas=True):
        """Paper or canvas tooth, plus a faint brush direction."""
        g = grain * self.noise(0.0025)
        if canvas:
            g += grain * 0.6 * self.noise(0.0015, 0.012)
        return lin_to_srgb(self.img * (1 + g)[..., None])


def rect(c, cx, cy, hw, hh, r=0.0):
    dx = np.abs(c.x - cx) - hw + r
    dy = np.abs(c.y - cy) - hh + r
    out = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2)
    return out + np.minimum(np.maximum(dx, dy), 0) - r


def circle(c, cx, cy, r):
    return np.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2) - r


def halfplane(c, nx, ny, d):
    """Negative on the side the normal (nx, ny) points away from."""
    return c.x * nx + c.y * ny - d


def blob(c, cx, cy, r, rng, lobes=3, amp=0.22):
    ang = np.arctan2(c.y - cy, c.x - cx)
    rr = np.full_like(ang, r)
    for k in range(2, 2 + lobes):
        rr = rr * (1 + amp / (k - 1) * np.sin(k * ang + rng.uniform(0, 6.28)))
    return np.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2) - rr


def segment_dist(c, pts):
    """Distance to a polyline plus the curve parameter (0..1) at the nearest point."""
    best = np.full(c.img.shape[:2], 1e9, np.float32)
    t_best = np.zeros_like(best)
    n = len(pts) - 1
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        vx, vy = bx - ax, by - ay
        L2 = max(vx * vx + vy * vy, 1e-9)
        t = np.clip(((c.x - ax) * vx + (c.y - ay) * vy) / L2, 0, 1)
        d = np.sqrt((c.x - ax - t * vx) ** 2 + (c.y - ay - t * vy) ** 2)
        closer = d < best
        best = np.where(closer, d, best)
        t_best = np.where(closer, (i + t) / n, t_best)
    return best, t_best


def bezier(p0, p1, p2, p3, n=48):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.array(p, np.float32) for p in (p0, p1, p2, p3))
    pts = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3
    return [tuple(p) for p in pts]


def lerp(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------- styles
# each takes (canvas, palette, rng) and paints in place

def color_field(c, P, rng):
    """Stacked fields of colour floating on a ground, edges feathered and
    breathing rather than ruled, each field glowing a little at its heart."""
    ground, c1, c2, c3, c4, dark = P
    base = [c3, dark, c1][rng.integers(3)]
    c.drift(base, 0.1, 0.3)
    m = 0.075
    splits = [[0.62, 0.38], [0.22, 0.48, 0.3], [0.5, 0.12, 0.38]][rng.integers(3)]
    cols = rng.permutation([c1, c2, c4, ground * 0.85])
    y = m
    gap = 0.04
    usable = 1 - 2 * m - gap * (len(splits) - 1)
    for i, s in enumerate(splits):
        hh = usable * s / 2
        cy = y + hh
        col = cols[i % len(cols)]
        sd = rect(c, c.a / 2, cy, c.a / 2 - m * 0.9, hh, 0.015)
        c.fill(sd, col, soft=16, wob=0.007, wscale=0.14, var=0.14, opacity=0.95, scale=0.25)
        # a lighter bloom toward the field's centre
        hw = c.a / 2 - m * 0.9
        glow = (np.clip(1 - ((c.x - c.a / 2) / hw) ** 2, 0, 1) * np.clip(1 - ((c.y - cy) / hh) ** 2, 0, 1)) ** 1.2 * 0.3
        c.glaze(glow * (0.6 + 0.4 * np.clip(0.5 + 0.5 * c.noise(0.2), 0, 1)), lerp(col, ground, 0.35))
        y += 2 * hh + gap


def arches(c, P, rng):
    """Mid-century rainbow: nested arches rising from a base line, a small sun."""
    ground, c1, c2, c3, c4, dark = P
    cx = c.a * rng.uniform(0.4, 0.6)
    by = rng.uniform(0.16, 0.24)
    cols = [c2, c1, c3, c4, dark]
    rng.shuffle(cols)
    r0 = min(c.a * 0.42, 0.58)
    n = 5
    dist = np.sqrt((c.x - cx) ** 2 + (c.y - by) ** 2)
    above = c.y - by
    for i in range(n):
        r_out = r0 * (1 - i / (n + 0.6))
        sd = np.maximum(dist - r_out, -above)
        c.fill(sd, cols[i % len(cols)], soft=1.2, wob=0.0015, var=0.05)
    c.fill(np.maximum(dist - r0 * 0.12, -above), ground, soft=1.2, wob=0.001, var=0.03)
    c.fill(circle(c, cx + rng.choice([-1, 1]) * r0 * 0.75, by + r0 * 1.15, 0.055), cols[0], soft=1.2, wob=0.001)
    c.fill(rect(c, c.a / 2, by - 0.012, c.a / 2 - 0.08, 0.004), dark, soft=1.0, wob=0.0005, var=0)


def bauhaus(c, P, rng):
    """Geometric study: a circle, a half disc, a bar and a line on a grid."""
    ground, c1, c2, c3, c4, dark = P
    cols = [c1, c2, c3, c4, dark]
    rng.shuffle(cols)
    a = c.a
    # a field block behind
    if rng.random() < 0.6:
        side = rng.integers(2)
        c.fill(halfplane(c, 1 - 2 * side, 0, a * rng.uniform(0.35, 0.65) * (1 - 2 * side)), c4 * 0.9 + ground * 0.1,
               soft=1.0, wob=0.001, var=0.04)
    r = rng.uniform(0.18, 0.3)
    cx, cy = a * rng.uniform(0.3, 0.7), rng.uniform(0.38, 0.68)
    c.fill(circle(c, cx, cy, r), cols[0], soft=1.0, wob=0.0012)
    # half disc, cut by a line through its centre
    hx, hy, hr = a * rng.uniform(0.25, 0.75), rng.uniform(0.15, 0.35), rng.uniform(0.12, 0.2)
    ang = rng.choice([0, np.pi / 2, np.pi, 3 * np.pi / 2])
    hp = (c.x - hx) * np.cos(ang) + (c.y - hy) * np.sin(ang)
    c.fill(np.maximum(circle(c, hx, hy, hr), hp), cols[1], soft=1.0, wob=0.001)
    if rng.random() < 0.7:
        bx = a * rng.uniform(0.15, 0.85)
        c.fill(rect(c, bx, 0.5, 0.025, rng.uniform(0.22, 0.38)), cols[2], soft=1.0, wob=0.001)
    ly = rng.uniform(0.1, 0.9)
    c.fill(rect(c, a / 2, ly, a * rng.uniform(0.25, 0.42), 0.005), dark, soft=0.8, wob=0.0005, var=0)


def cutouts(c, P, rng):
    """Paper cut-outs: a few flat organic shapes, overlapping a little."""
    ground, c1, c2, c3, c4, dark = P
    cols = [c1, c2, c3, c4, dark]
    rng.shuffle(cols)
    for i in range(rng.integers(4, 6)):
        cx, cy = c.a * rng.uniform(0.15, 0.85), rng.uniform(0.15, 0.85)
        r = rng.uniform(0.12, 0.27)
        c.fill(blob(c, cx, cy, r, rng, lobes=3, amp=0.3), cols[i % len(cols)], soft=1.2, wob=0.002, var=0.04)
    c.fill(circle(c, c.a * rng.uniform(0.2, 0.8), rng.uniform(0.2, 0.8), 0.03), ground, soft=1.0, wob=0.0008)


def horizon(c, P, rng):
    """Banded landscape: sky to field, a pale disc, haze across the line."""
    ground, c1, c2, c3, c4, dark = P
    bands = [(1.0, ground), (rng.uniform(0.58, 0.7), c3), (rng.uniform(0.42, 0.5), c2),
             (rng.uniform(0.28, 0.36), c1), (rng.uniform(0.1, 0.18), dark)]
    c.drift(bands[0][1], 0.06, 0.3)
    for top, col in bands[1:]:
        edge = c.y - top + 0.025 * c.noise(0.25, 0.04) + 0.008 * c.noise(0.03)
        c.fill(edge, col, soft=10, wob=0, var=0.12, scale=0.15)
    sx, sy = c.a * rng.uniform(0.25, 0.75), rng.uniform(0.66, 0.82)
    c.fill(circle(c, sx, sy, rng.uniform(0.06, 0.1)), lerp(ground, c4, 0.6), soft=6, wob=0.002, var=0.03)
    haze = np.clip(1 - np.abs(c.y - bands[2][0]) / 0.08, 0, 1) * (0.3 + 0.15 * c.noise(0.2, 0.03))
    c.glaze(np.clip(haze, 0, 0.45), ground)


def lines(c, P, rng):
    """Graphite study: bands of hand-ruled lines that thicken and thin down
    the sheet over a pale wash, one band washed with colour."""
    ground, c1, c2, c3, c4, dark = P
    wash = lerp(ground, [c4, c3, c2][rng.integers(3)], rng.uniform(0.12, 0.25))
    c.drift(wash, 0.06, 0.35)
    m = 0.08
    inside = np.clip(0.5 - rect(c, c.a / 2, 0.5, c.a / 2 - m, 0.5 - m) / c.px, 0, 1)
    band = rng.uniform(0.3, 0.7)
    tint = np.clip(1 - np.abs(c.y - band) / 0.12, 0, 1) * inside
    c.glaze(tint * 0.8, lerp(c3, ground, 0.1))
    n = int(rng.integers(30, 42))
    pencil = lerp(wash, dark, 0.92)
    for i in range(n + 1):
        y = m + (1 - 2 * m) * i / n
        weight = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(i / n * np.pi * rng.uniform(1.5, 3.0) + rng.uniform(0, 6)))
        d = np.abs(c.y - y - 0.0015 * c.noise(0.4, 0.06)) - 0.0024 * (0.5 + weight)
        stroke = np.clip(0.5 - d / c.px, 0, 1) * inside * weight
        c.glaze(stroke * np.clip(0.8 + 0.3 * c.noise(0.01, 0.002), 0, 1), pencil)


def ink_enso(c, P, rng):
    """Sumi ink: one brush circle, thick to dry, and a small red seal."""
    ground, c1, c2, c3, c4, dark = P
    cx, cy, r = c.a / 2 + rng.uniform(-0.04, 0.04), 0.53, min(c.a, 1) * rng.uniform(0.3, 0.36)
    ang = np.arctan2(c.y - cy, c.x - cx)
    start = rng.uniform(0, 6.28)
    t = np.mod(-(ang - start), 2 * np.pi) / (2 * np.pi * rng.uniform(0.86, 0.95))
    on = (t <= 1).astype(np.float32)
    width = 0.07 * (1 - 0.75 * t) + 0.012
    dist = np.abs(np.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2) - r * (1 + 0.04 * np.sin(t * 5)))
    sd = dist - width / 2
    # dry brush: streaks along the stroke appear as the ink runs out
    across = (np.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2) - r) / np.maximum(width, 1e-3)
    streak = np.sin(across * 40 + 3 * c.noise(0.05)) * 0.5 + 0.5
    dry = np.clip((t - 0.45) * 2.2, 0, 1) * (streak < 0.55)
    m = np.clip(0.5 - (sd + 0.004 * c.noise(0.01)) / (1.4 * c.px), 0, 1) * on * (1 - dry * 0.9)
    c.glaze(m * 0.95, dark * (1 + 0.15 * c.noise(0.05))[..., None])
    c.fill(rect(c, cx + r * 1.05, cy - r * 1.25, 0.022, 0.03, 0.002), c3, soft=1.0, wob=0.0006, var=0.1)


def contour(c, P, rng):
    """Topographic map: terraced levels of a noise landscape, fine contour lines."""
    ground, c1, c2, c3, c4, dark = P
    hgt = 0.6 * c.noise(0.28) + 0.3 * c.noise(0.1) + 0.1 * c.noise(0.035)
    levels = 9
    q = (hgt - hgt.min()) / (hgt.max() - hgt.min()) * levels
    ramp = [ground, lerp(ground, c4, 0.5), c4, lerp(c4, c2, 0.5), c2, lerp(c2, c1, 0.5), c1, lerp(c1, dark, 0.4),
            lerp(c1, dark, 0.7), dark]
    idx = np.clip(np.floor(q).astype(int), 0, levels)
    rmp = np.array(ramp, np.float32)
    c.img = rmp[idx] * (1 + 0.04 * c.noise(0.2))[..., None]
    f = q - np.floor(q)
    grad = np.sqrt(np.gradient(q, axis=0) ** 2 + np.gradient(q, axis=1) ** 2) + 1e-4
    d = np.minimum(f, 1 - f) / grad
    c.glaze(np.clip(1.2 - d, 0, 1) * 0.55, lerp(dark, ground, 0.15))


def waves(c, P, rng):
    """Op-art: two colours in tight bands, bent by slow waves."""
    ground, c1, c2, c3, c4, dark = P
    fg = [dark, c1][rng.integers(2)]
    f = rng.uniform(2.2, 3.4)
    amp = rng.uniform(0.03, 0.06)
    n = rng.integers(26, 38)
    phase = c.y * n * 2 * np.pi + amp * n * 2 * np.pi * np.sin(c.x * f * 2 * np.pi + c.y * 3) * (0.6 + 0.4 * np.sin(c.y * 3.1))
    # antialiased band edges: one pixel of phase is about 2 pi n px
    m = np.clip(0.5 + np.sin(phase) / (2 * np.pi * n * c.px * 1.5), 0, 1)
    c.glaze(m, fg)


def gestural(c, P, rng):
    """Abstract-expressionist canvas: big sweeping brushstrokes laid over a
    stained ground, each with bristle streaks that run dry toward its end."""
    ground, c1, c2, c3, c4, dark = P
    c.drift(lerp(ground, c2, 0.18), 0.1, 0.45)
    stain = np.clip(0.5 + 0.6 * c.noise(0.3), 0, 1)
    c.glaze(stain * 0.3, lerp(c2, c1, 0.35))
    c.glaze(np.clip(0.5 + 0.7 * c.noise(0.5), 0, 1) * 0.18, c4)
    a = c.a
    strokes = [(dark, 0.26), (c1, 0.22), (c3, 0.18), (dark, 0.12), (c2, 0.16), (c4, 0.13), (ground, 0.1),
               (c1, 0.08), (dark, 0.045)]
    for k, (col, wdt) in enumerate(strokes):
        # long, mostly horizontal sweeps that cross the canvas
        y0 = rng.uniform(0.15, 0.85)
        y1 = np.clip(y0 + rng.uniform(-0.3, 0.3), 0.12, 0.88)
        x0, x1 = a * rng.uniform(-0.1, 0.2), a * rng.uniform(0.75, 1.1)
        if rng.random() < 0.5:
            x0, x1 = x1, x0
        pts = bezier((x0, y0), (lerp(x0, x1, 0.33), y0 + rng.uniform(-0.2, 0.2)),
                     (lerp(x0, x1, 0.66), y1 + rng.uniform(-0.2, 0.2)), (x1, y1), n=40)
        d, t = segment_dist(c, pts)
        taper = np.sqrt(np.clip(np.sin(np.pi * np.clip(t * 0.92 + 0.04, 0, 1)), 0, 1))
        w = wdt * (0.45 + 0.55 * taper)
        across = np.clip(d / np.maximum(w / 2, 1e-4), 0, 1)
        # bristles: a random profile across the brush, constant along it
        prof = rng.random(48).astype(np.float32)
        prof = np.convolve(prof, np.ones(3) / 3, "same")
        bristle = np.interp(across, np.linspace(0, 1, 48), prof)
        load = 1.15 - t * rng.uniform(0.6, 1.0)
        # the brush lands with a few bristles, so the start fades in as well
        cover = np.clip((load + 0.3 - (1 - bristle) * 0.75) * 3, 0, 1) * np.clip(t / 0.06, 0, 1)
        rough = 0.0012 * c.noise(0.008) + 0.007 * c.noise(0.09)
        edge = np.clip(0.5 - (d - w / 2 + rough) / (2.0 * c.px), 0, 1)
        m = edge * cover * (0.85 + 0.15 * bristle)
        shade = (0.85 + 0.3 * bristle)[..., None]
        c.glaze(m * 0.95, col * shade)


def squares(c, P, rng):
    """Homage to the square: three nested squares sitting low in the field."""
    ground, c1, c2, c3, c4, dark = P
    trio = rng.choice([[c1, c3, c2], [c4, c2, c1], [dark, c1, c3], [c2, c4, ground]])
    c.drift(trio[0], 0.04, 0.4)
    a = c.a
    for k, col in enumerate(trio[1:], start=1):
        s = 0.5 * (1 - k * 0.25)
        cy = 0.5 - 0.05 * k
        hs = s * min(a, 1.0)
        c.fill(rect(c, a / 2, cy, hs, hs), col, soft=1.0, wob=0.0008, var=0.03)


def impasto(c, P, rng):
    """Near-monochrome, palette-knife paint: overlapping knife strokes in
    relief, lit from the upper left, with one scraped band of lighter colour."""
    ground, c1, c2, c3, c4, dark = P
    base = [c1, c4, c3][rng.integers(3)]
    c.drift(base, 0.06, 0.3)
    hgt = np.zeros(c.img.shape[:2], np.float32)
    for i in range(70):
        cx, cy = c.a * rng.uniform(0, 1), rng.uniform(0, 1)
        th = rng.uniform(-0.6, 0.6) + (np.pi / 2 if rng.random() < 0.3 else 0)
        L, W = rng.uniform(0.12, 0.3), rng.uniform(0.04, 0.09)
        x = (c.x - cx) * np.cos(th) + (c.y - cy) * np.sin(th)
        y = -(c.x - cx) * np.sin(th) + (c.y - cy) * np.cos(th)
        inside = np.clip(1 - np.maximum(np.abs(x) / L, np.abs(y) / W) ** 6, 0, 1)
        # a knife stroke: a flat plateau with a ridge of paint at its trailing edge
        ridge = np.exp(-((x + L * 0.9) / 0.012) ** 2) * (np.abs(y) < W)
        hgt = np.maximum(hgt * (1 - inside * 0.8), inside * rng.uniform(0.3, 1.0) + ridge * 0.8)
    hgt = hgt + 0.15 * c.noise(0.004)
    gy, gx = np.gradient(hgt * 40.0)
    shade = np.clip(0.8 + (-gx * 0.6 + gy * 0.6) * c.px * 60, 0.45, 1.35)
    tone = 1 + 0.08 * c.noise(0.2)
    c.img = c.img * (shade * tone)[..., None]
    by = rng.uniform(0.3, 0.7)
    band = np.clip(1 - np.abs(c.y - by - 0.03 * c.noise(0.3, 0.05)) / 0.06, 0, 1)
    c.glaze(band * np.clip(hgt, 0, 1) * 0.6, lerp(base, ground, 0.6) * shade[..., None])


def collage(c, P, rng):
    """Torn papers: tilted rectangles with ragged edges, a few ruled lines."""
    ground, c1, c2, c3, c4, dark = P
    cols = [c1, c2, c3, c4, lerp(ground, dark, 0.15), dark]
    rng.shuffle(cols)
    for i in range(rng.integers(5, 8)):
        cx, cy = c.a * rng.uniform(0.2, 0.8), rng.uniform(0.2, 0.8)
        hw, hh = c.a * rng.uniform(0.1, 0.3), rng.uniform(0.07, 0.22)
        th = rng.uniform(-0.25, 0.25)
        x = (c.x - cx) * np.cos(th) + (c.y - cy) * np.sin(th)
        y = -(c.x - cx) * np.sin(th) + (c.y - cy) * np.cos(th)
        sd = np.maximum(np.abs(x) - hw, np.abs(y) - hh) + 0.0025 * c.noise(0.006) + 0.005 * c.noise(0.03)
        # a pale torn fibre edge just outside the paper
        c.fill(sd - 0.004, lerp(ground, cols[i % len(cols)], 0.15), soft=1.0, wob=0, var=0)
        c.fill(sd, cols[i % len(cols)], soft=1.0, wob=0, var=0.06)
    for i in range(rng.integers(2, 4)):
        y = rng.uniform(0.1, 0.9)
        c.fill(rect(c, c.a * rng.uniform(0.3, 0.7), y, c.a * rng.uniform(0.15, 0.3), 0.0025), dark, soft=0.8, wob=0.0004,
               var=0)


def moonscape(c, P, rng):
    """Night landscape: dark gradient sky, a pale moon, layered rolling hills."""
    ground, c1, c2, c3, c4, dark = P
    sky = lerp(dark, c2, 0.35)
    # darkest overhead, lifting toward the hills
    c.img = (dark + (sky - dark) * np.clip(1.15 - c.y, 0, 1)[..., None]) * (1 + 0.05 * c.noise(0.3))[..., None]
    c.fill(circle(c, c.a * rng.uniform(0.25, 0.75), rng.uniform(0.66, 0.78), 0.1), ground, soft=3, wob=0.001, var=0.04)
    hills = [(0.5, c3), (0.38, c1), (0.26, c4), (0.12, dark)]
    for k, (base, col) in enumerate(hills):
        f1, f2 = rng.uniform(1.0, 2.0), rng.uniform(3, 5)
        top = base + 0.05 * np.sin(c.x * f1 * np.pi + rng.uniform(0, 6)) + 0.02 * np.sin(c.x * f2 * np.pi + rng.uniform(0, 6))
        c.fill(c.y - top, col, soft=2, wob=0.003, var=0.1)


def zip_field(c, P, rng):
    """One deep field split by a thin vertical 'zip' or two."""
    ground, c1, c2, c3, c4, dark = P
    field = [c1, c2, lerp(c1, dark, 0.4)][rng.integers(3)]
    c.drift(field, 0.07, 0.4)
    zips = [c.a * rng.uniform(0.3, 0.42)] + ([c.a * rng.uniform(0.62, 0.8)] if rng.random() < 0.5 else [])
    for x in zips:
        c.fill(np.abs(c.x - x) - rng.uniform(0.006, 0.014), [ground, c3, c4][rng.integers(3)], soft=1.6, wob=0.0012,
               var=0.05)


def dots(c, P, rng):
    """Dot field: a grid of discs that swell and shrink across the sheet."""
    ground, c1, c2, c3, c4, dark = P
    col = [c1, dark, c2][rng.integers(3)]
    n = rng.integers(10, 15)
    pitch = 1.0 / n
    gx = (np.floor(c.x / pitch) + 0.5) * pitch
    gy = (np.floor(c.y / pitch) + 0.5) * pitch
    fx, fy = rng.uniform(0.6, 1.4), rng.uniform(0.6, 1.4)
    rad = pitch * 0.42 * (0.25 + 0.75 * (0.5 + 0.5 * np.sin(gx * fx * 4 + gy * fy * 3 + rng.uniform(0, 6))))
    sd = np.sqrt((c.x - gx) ** 2 + (c.y - gy) ** 2) - rad
    m = 0.06
    keep = (rect(c, c.a / 2, 0.5, c.a / 2 - m, 0.5 - m) < 0)
    c.fill(np.where(keep, sd, 1.0), col, soft=1.0, wob=0.0005, var=0.05)


def split(c, P, rng):
    """Hard-edge: the field cut by one sweeping curve into two colours, a bar."""
    ground, c1, c2, c3, c4, dark = P
    A, B = [(c1, c3), (c2, dark), (c4, c1), (dark, c2)][rng.integers(4)]
    c.drift(A, 0.04, 0.4)
    k = rng.uniform(0.6, 1.4)
    edge = c.y - (0.5 + 0.32 * np.sin((c.x / c.a) * np.pi * k + rng.uniform(-0.5, 0.5)) * rng.choice([-1, 1]))
    c.fill(edge * rng.choice([-1, 1]), B, soft=1.0, wob=0.0008, var=0.03)
    c.fill(circle(c, c.a * rng.uniform(0.2, 0.8), rng.uniform(0.2, 0.8), rng.uniform(0.06, 0.12)), ground, soft=1.0,
           wob=0.0008, var=0.03)


def bokeh(c, P, rng):
    """Out-of-focus city light: soft overlapping discs on a deep ground."""
    ground, c1, c2, c3, c4, dark = P
    c.drift(dark, 0.08, 0.4)
    acc = np.zeros_like(c.img)
    for i in range(70):
        r = rng.uniform(0.02, 0.11)
        col = [c1, c2, c3, c4, ground][rng.integers(5)]
        sd = circle(c, c.a * rng.uniform(0, 1), rng.uniform(0, 1) ** 1.3, r)
        m = np.clip(0.5 - sd / (r * 0.25), 0, 1) * (0.6 + 0.4 * np.clip(1 + sd / r, 0, 1))
        acc += m[..., None] * col * rng.uniform(0.15, 0.45)
    c.img = c.img + acc


def gold_disc(c, P, rng):
    """A gold-leaf sun on a deep lacquered ground, its edge left ragged where
    the leaf was laid by hand, a thin ring and a vermilion seal."""
    ground, c1, c2, c3, c4, dark = P
    deep = lerp(dark, c1, 0.35)
    c.drift(deep, 0.08, 0.3)
    c.glaze(np.clip(0.5 + 0.5 * c.noise(0.4), 0, 1) * 0.25, lerp(deep, c1, 0.5))
    cx, cy, r = c.a / 2, rng.uniform(0.52, 0.6), min(c.a, 1) * 0.3
    sd = circle(c, cx, cy, r) + 0.002 * c.noise(0.006) + 0.005 * c.noise(0.06)
    c.leaf(np.clip(0.5 - sd / (1.2 * c.px), 0, 1))
    ring = np.abs(circle(c, cx, cy, r * 1.32)) - 0.0018
    c.leaf(np.clip(0.5 - ring / c.px, 0, 1) * 0.9)
    c.fill(rect(c, c.a * 0.82, 0.12, 0.022, 0.03, 0.002), _hex("#A8321E"), soft=1.0, wob=0.0006, var=0.1)


def kintsugi(c, P, rng):
    """Black lacquer, cracked and mended in gold: a branching network of
    seams, thick where the break was widest."""
    ground, c1, c2, c3, c4, dark = P
    c.drift(dark, 0.06, 0.25)
    c.glaze(np.clip(0.5 + 0.5 * c.noise(0.3), 0, 1) * 0.3, lerp(dark, c1, 0.3))
    seams = np.zeros(c.img.shape[:2], np.float32)
    for scale, width, amt in ((0.3, 0.008, 1.0), (0.14, 0.005, 0.95), (0.06, 0.0028, 0.8)):
        n = c.noise(scale) + 0.25 * c.noise(scale / 3)
        g = np.sqrt(np.gradient(n, axis=0) ** 2 + np.gradient(n, axis=1) ** 2) + 1e-5
        d = np.abs(n) / g * c.px      # distance to the zero line, in height units
        gate = np.clip(c.noise(scale * 1.5) + 0.6, 0, 1) if scale < 0.3 else 1.0
        seams = np.maximum(seams, np.clip(0.5 - (d - width) / c.px, 0, 1) * amt * gate)
    c.leaf(seams, size=0.03)


def gilded_field(c, P, rng):
    """Colour field with one band laid in gold leaf between two painted fields."""
    ground, c1, c2, c3, c4, dark = P
    c.drift(dark, 0.08, 0.3)
    m = 0.08
    hw = c.a / 2 - m
    c.fill(rect(c, c.a / 2, 0.74, hw, 0.16, 0.01), lerp(c1, dark, 0.2), soft=14, wob=0.006, wscale=0.14, var=0.14)
    band = rect(c, c.a / 2, 0.47, hw, 0.075, 0.004) + 0.0015 * c.noise(0.01) + 0.003 * c.noise(0.08)
    c.leaf(np.clip(0.5 - band / (1.2 * c.px), 0, 1))
    c.fill(rect(c, c.a / 2, 0.2, hw, 0.12, 0.01), lerp(c3, dark, 0.3), soft=14, wob=0.006, wscale=0.14, var=0.14)


STYLES = {f.__name__: f for f in (gold_disc, kintsugi, gilded_field, color_field, arches, bauhaus, cutouts, horizon, lines, ink_enso, contour, waves,
                                  gestural, squares, impasto, collage, moonscape, zip_field, dots, split, bokeh)}
PAPER = {"lines", "ink_enso", "contour", "dots", "bauhaus", "collage", "waves"}


def make(style, pal, seed, w_m, h_m, px_per_m=820, max_px=1024, min_px=320, with_rough=False):
    """Renders one work; returns sRGB (h, w, 3) floats, plus its roughness map
    (None unless the work has gold leaf) when with_rough is set."""
    scale = min(px_per_m, max_px / max(w_m, h_m))
    w, h = int(round(w_m * scale)), int(round(h_m * scale))
    if min(w, h) < min_px:
        k = min_px / min(w, h)
        w, h = int(round(w * k)), int(round(h * k))
    rng = np.random.default_rng(seed)
    P = palette(pal)
    c = Canvas(w, h, rng, P[0])
    STYLES[style](c, P, rng)
    img = c.finish(canvas=style not in PAPER)
    return (img, c.rough) if with_rough else img
