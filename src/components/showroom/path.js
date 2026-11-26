import { CatmullRomCurve3, Vector3 } from "three";
import { monotone } from "../gallery/path";
import pathData from "./data/path.json";

// The showroom's walk (scene/build_showroom.py writes it): the same curves as
// the gallery's, so the browser follows exactly the path the Blender previews
// were rendered from.

const remap = monotone(
  pathData.keys.map((k) => k.p),
  pathData.keys.map((_, i) => i / (pathData.keys.length - 1)),
);
const positions = new CatmullRomCurve3(pathData.keys.map((k) => new Vector3(...k.pos)), false, "centripetal");
const targets = new CatmullRomCurve3(pathData.keys.map((k) => new Vector3(...k.target)), false, "centripetal");

export const FOV = pathData.fov;
export const WALK = pathData.walk; // the walk's length; the hero's scroll height scales with it
export const ROOMS = pathData.rooms; // the Rooms menu's stops
// each work on show: its eye icon, the stretch of the walk it shows over, the
// stop that frames it (at) and its catalogue details
export const PRODUCTS = pathData.products;
// the doors that swing with the walk: hinge, how far open, and over which
// stretches of the walk they open and (the bedroom's) shut again
export const DOORS = pathData.doors ?? [];

// Where the walk comes to rest: each room's start and each stop that frames works.
const STOPS = [...new Set([...ROOMS.map((r) => r.p), ...PRODUCTS.map((w) => w.at)])].sort((a, b) => a - b);

/** The walk's stops, for a swipe or an arrow key to travel between (walk.js). */
export const getStops = () => STOPS;

/** Camera position and target at a scroll progress. */
export function samplePath(progress, outPos, outTarget) {
  const t = remap(Math.min(1, Math.max(0, progress)));
  positions.getPoint(t, outPos);
  targets.getPoint(t, outTarget);
}
