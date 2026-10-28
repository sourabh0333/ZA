"""Camera path shared with the website.

Port of three.js CatmullRomCurve3 ('centripetal') so Blender previews match the
browser exactly. Coordinates here are Blender world space (Z up).
"""
import math


def _cubic(x0, x1, x2, x3, dt0, dt1, dt2):
    t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1
    t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2
    t1 *= dt1
    t2 *= dt1
    c0, c1 = x1, t1
    c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2
    c3 = 2 * x1 - 2 * x2 + t1 + t2
    return lambda t: c0 + c1 * t + c2 * t * t + c3 * t * t * t


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _d2(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))


def catmull(points, t):
    n = len(points)
    p = (n - 1) * t
    i = int(math.floor(p))
    w = p - i
    if i >= n - 1:
        i, w = n - 2, 1.0
    p0 = points[i - 1] if i > 0 else _add(_sub(points[0], points[1]), points[0])
    p1, p2 = points[i], points[i + 1]
    p3 = points[i + 2] if i + 2 < n else _add(_sub(points[n - 1], points[n - 2]), points[n - 1])
    dt0 = _d2(p0, p1) ** 0.25
    dt1 = _d2(p1, p2) ** 0.25
    dt2 = _d2(p2, p3) ** 0.25
    if dt1 < 1e-4:
        dt1 = 1.0
    if dt0 < 1e-4:
        dt0 = dt1
    if dt2 < 1e-4:
        dt2 = dt1
    return tuple(_cubic(p0[k], p1[k], p2[k], p3[k], dt0, dt1, dt2)(w) for k in range(3))


def monotone(xs, ys):
    """Fritsch-Carlson monotone cubic; returns f(x). Mirrors src/.../path.js."""
    n = len(xs)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for i in range(1, n - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2
    for i in range(n - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0.0
            continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        s = a * a + b * b
        if s > 9:
            tau = 3 / math.sqrt(s)
            m[i], m[i + 1] = tau * a * d[i], tau * b * d[i]

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = max(j for j in range(n - 1) if xs[j] <= x)
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1])

    return f


def sampler(keys):
    """keys: list of {p, pos, target}. Returns sample(progress) -> (pos, target)."""
    pts = [k["pos"] for k in keys]
    tgs = [k["target"] for k in keys]
    n = len(keys)
    remap = monotone([k["p"] for k in keys], [i / (n - 1) for i in range(n)])

    def sample(progress):
        t = remap(progress)
        return catmull(pts, t), catmull(tgs, t)

    return sample


def to_three(v):
    """Blender (x, y, z) Z-up -> three.js (x, z, -y) Y-up."""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]
