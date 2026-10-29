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

const remap = monotone(
  pathData.keys.map((k) => k.p),
  pathData.keys.map((_, i) => i / (pathData.keys.length - 1)),
);

function curves(keys) {
  return {
    positions: new CatmullRomCurve3(keys.map((k) => new Vector3(...k.pos)), false, "centripetal"),
    targets: new CatmullRomCurve3(keys.map((k) => new Vector3(...k.target)), false, "centripetal"),
  };
}

// The path as designed (for a 4:3 screen); framing.js swaps in a copy fitted
// to the screen the site is on, with a lens shift per key.
let path = curves(pathData.keys);
let shifts = null;

/** Replaces the camera positions (same keys, same timing) and the per-key lens shift [x, y] in px. */
export function setFraming(keys, keyShifts) {
  path = curves(keys);
  shifts = keyShifts;
}

export const KEYS = pathData.keys;
export const FOV = pathData.fov;
export const WALK = pathData.walk; // the walk's length; the hero's scroll height scales with it
export const BRIGHT_FROM = pathData.brightFrom; // where the rooms turn light (the nav tab appears)
export const ROOMS = pathData.rooms; // the Rooms menu's stops
export const LABELS = pathData.labels; // the works each stop frames, for fitting the path to the screen
export const WORKS = pathData.works; // each work's eye icon: where it sits, when it shows, who made the work
export const VAULT = pathData.vault;
export const ZONES = pathData.zones; // which parts of the building to draw over which stretch of the walk

/** Camera position and target at a scroll progress; returns the lens shift [x, y] in px. */
export function samplePath(progress, outPos, outTarget, outShift) {
  const t = remap(Math.min(1, Math.max(0, progress)));
  path.positions.getPoint(t, outPos);
  path.targets.getPoint(t, outTarget);
  if (!shifts) {
    outShift[0] = outShift[1] = 0;
    return outShift;
  }
  // eased between keys, so the shift settles as the camera passes a work
  const f = t * (shifts.length - 1);
  const i = Math.min(shifts.length - 2, Math.floor(f));
  const u = f - i;
  const s = u * u * (3 - 2 * u);
  outShift[0] = shifts[i][0] + (shifts[i + 1][0] - shifts[i][0]) * s;
  outShift[1] = shifts[i][1] + (shifts[i + 1][1] - shifts[i][1]) * s;
  return outShift;
}
