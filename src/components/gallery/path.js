import { CatmullRomCurve3, Vector3 } from "three";
import pathData from "./data/path.json";

// Fritsch–Carlson monotone cubic, mirrors scene/lib/camera_path.py so the
// browser follows exactly the path the Blender previews were rendered from.
function monotone(xs, ys) {
  const n = xs.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0], ...new Array(n - 2).fill(0), d[n - 2]];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && xs[i + 1] <= x) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

const keys = pathData.keys;
const positions = new CatmullRomCurve3(keys.map((k) => new Vector3(...k.pos)), false, "centripetal");
const targets = new CatmullRomCurve3(keys.map((k) => new Vector3(...k.target)), false, "centripetal");
const remap = monotone(
  keys.map((k) => k.p),
  keys.map((_, i) => i / (keys.length - 1)),
);

export const FOV = pathData.fov;
export const HOTSPOTS = pathData.hotspots;
export const CARD = pathData.card;
export const VAULT = pathData.vault;

export function samplePath(progress, outPos, outTarget) {
  const t = remap(Math.min(1, Math.max(0, progress)));
  positions.getPoint(t, outPos);
  targets.getPoint(t, outTarget);
}
