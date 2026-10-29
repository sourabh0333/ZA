import { Box3, MathUtils, Raycaster, Vector3 } from "three";
import { FOV, KEYS, LABELS } from "./path";
import { PEOPLE, PERSON_RADIUS } from "./visitors";

// The camera path is composed for a 4:3 screen (see art_view in
// scene/build_scene.py): about 31 degrees either side of the view. A phone held
// upright sees barely a third of that width, so on narrow screens the camera
// widens its lens a little, steps back from each work until the work fits the
// part of the screen the header and the Rooms bar leave clear, and shifts the
// lens so the work sits in the middle of that part. On a wide screen nothing
// moves.

const DESIGN_HALF_H = Math.tan(MathUtils.degToRad(31));
const MAX_FOV = 72; // vertical; wider than this and the rooms start to bend
const FILL = 0.92; // a work (with its frame) may fill this much of the clear area
const FRAME = 0.1; // the frame's width around the painted face, metres
const TRANSIT = 0.72; // between works, keep this share of the designed width in view
const WALL_GAP = 0.45; // closest the camera may back up to anything behind it
const GAP = 12; // px between the clear area and the header

const up = new Vector3(0, 1, 0);
const fwd = new Vector3();
const right = new Vector3();
const rel = new Vector3();

/** Each work's box (from its painted face) and how far the camera can back up at each key. */
export function measureGallery(scene) {
  scene.updateMatrixWorld(true);
  const works = new Map();
  const solids = [];
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    solids.push(obj);
    const name = obj.material.name || "";
    if (name.startsWith("art_")) works.set(name.slice(4), new Box3().setFromObject(obj).expandByScalar(FRAME));
  });

  // each stop's works, and all of them together
  const boxes = new Map();
  for (const l of LABELS) {
    const each = l.id
      .split("-")
      .filter((id) => works.has(id))
      .map((id) => works.get(id));
    if (each.length) boxes.set(l.id, { all: each.reduce((b, w) => b.union(w), new Box3()), each });
  }

  const gallery = { boxes, solids, room: null };
  // how far back the camera may step at each key: raycasting the whole building
  // is slow, and only narrow screens step back, so it is worked out on first need
  Object.defineProperty(gallery, "clearance", {
    get() {
      gallery.room ??= KEYS.map((k) => clearance(gallery, new Vector3(...k.pos), new Vector3(...k.target)));
      return gallery.room;
    },
  });
  return gallery;
}

const ray = new Raycaster();
ray.far = 12;
const origin = new Vector3();
const back = new Vector3();

/** How far the camera can back away from target, straight back from pos at eye height. */
function clearance(gallery, pos, target) {
  back.set(pos.x - target.x, 0, pos.z - target.z).normalize();
  right.crossVectors(up, back).normalize();
  let free = ray.far;
  // a little to either side too, so the camera never grazes a door frame
  for (const side of [-0.3, 0, 0.3]) {
    origin.copy(pos).addScaledVector(right, side);
    ray.set(origin, back);
    const hit = ray.intersectObjects(gallery.solids, false)[0];
    if (hit) free = Math.min(free, hit.distance);
    free = Math.min(free, toPeople(origin, back));
  }
  return Math.max(0, free - WALL_GAP);
}

/** Distance along a level ray to the first visitor it would walk into (visitors.js), or Infinity. */
function toPeople(o, dir) {
  let near = Infinity;
  for (const { pos } of PEOPLE) {
    const fx = o.x - pos[0];
    const fz = o.z - pos[2];
    const b = fx * dir.x + fz * dir.z;
    const disc = b * b - (fx * fx + fz * fz - PERSON_RADIUS * PERSON_RADIUS);
    const t = -b - Math.sqrt(Math.max(0, disc));
    if (disc >= 0 && t >= 0) near = Math.min(near, t);
  }
  return near;
}

/** How far back from target (horizontally) the camera must stand for box to fill the clear area. */
function fitDistance(box, pos, target, tanX, tanY) {
  fwd.set(target.x - pos.x, 0, target.z - pos.z).normalize();
  right.crossVectors(fwd, up).normalize();
  let need = 0;
  for (let c = 0; c < 8; c++) {
    rel.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z);
    rel.sub(target);
    const depth = rel.dot(fwd);
    need = Math.max(
      need,
      Math.abs(rel.dot(right)) / (tanX * FILL) - depth,
      Math.abs(rel.dot(up)) / (tanY * FILL) - depth,
    );
  }
  return need;
}

/** Which stop (if any) each key frames. */
const keyLabel = KEYS.map((k) => LABELS.find((l) => k.p >= l.range[0] - 1e-4 && k.p <= l.range[1] + 1e-4));

/**
 * The path fitted to a stage of width x height.
 * layout, in stage px: { header, side, bottomBar }.
 */
export function frame(gallery, width, height, layout) {
  const aspect = width / height;
  const portrait = aspect < 1;
  // a phone on its side: so little height that the header and bar crowd the work
  const short = !portrait && height < 560;
  if (!portrait && !short) return { fov: FOV, keys: KEYS, shifts: null };

  const side = layout.side;
  const top = layout.header + GAP;
  const clearArea = () => ({ x0: side, x1: width - side, y0: top, y1: height - layout.bottomBar });

  // widen the lens until the clear area spans the designed width, within reason
  const open = clearArea();
  const needHalfV = Math.atan((DESIGN_HALF_H * height) / (open.x1 - open.x0));
  const fov = MathUtils.clamp(MathUtils.radToDeg(2 * needHalfV), FOV, MAX_FOV);
  const f = height / 2 / Math.tan(MathUtils.degToRad(fov / 2)); // focal length, px

  const areas = KEYS.map(() => {
    const area = clearArea();
    // tangents of the clear area's half-width and half-height, seen from the lens
    return { ...area, tanX: (area.x1 - area.x0) / 2 / f, tanY: (area.y1 - area.y0) / 2 / f };
  });

  // groups the room is too small to take in at once, from any of their keys
  // (a group framed by a single key is taken in as best the room allows)
  const pan = new Set();
  KEYS.forEach((k, i) => {
    const boxes = keyLabel[i] && gallery.boxes.get(keyLabel[i].id);
    if (!boxes || boxes.each.length < 2 || keyLabel.filter((l) => l === keyLabel[i]).length < 2) return;
    const pos = new Vector3(...k.pos);
    const target = new Vector3(...k.target);
    const dist = Math.hypot(target.x - pos.x, target.z - pos.z);
    const need = fitDistance(boxes.all, pos, target, areas[i].tanX, areas[i].tanY);
    if (need - dist > gallery.clearance[i] + 0.05) pan.add(keyLabel[i]);
  });

  const keys = [];
  const shifts = [];
  KEYS.forEach((k, i) => {
    const label = keyLabel[i];
    const { tanX, tanY, ...area } = areas[i];
    const cx = (area.x0 + area.x1) / 2;
    const cy = (area.y0 + area.y1) / 2;

    const target = new Vector3(...k.target);
    const pos = new Vector3(...k.pos);
    let dist = Math.hypot(target.x - pos.x, target.z - pos.z);
    let room = gallery.clearance[i];
    let need;
    const boxes = label && gallery.boxes.get(label.id);
    if (boxes) {
      // far enough back that every corner of the work(s) lands in the clear area
      need = fitDistance(boxes.all, pos, target, tanX, tanY);
      if (pan.has(label)) {
        // the room is too small to take in the whole group: look along it
        // instead, from the first work (left) at the stop's start to the last
        fwd.set(target.x - pos.x, 0, target.z - pos.z).normalize();
        right.crossVectors(fwd, up).normalize();
        const along = boxes.each
          .map((b) => b.getCenter(new Vector3()))
          .sort((a, b) => a.clone().sub(pos).dot(right) - b.clone().sub(pos).dot(right));
        const first = keyLabel[i - 1] !== label;
        const work = first ? along[0] : along[along.length - 1];
        const box = boxes.each.find((b) => b.containsPoint(work));
        target.copy(work);
        dist = Math.hypot(target.x - pos.x, target.z - pos.z);
        room = clearance(gallery, pos, target);
        need = fitDistance(box, pos, target, tanX, tanY);
      }
    } else {
      need = (dist * TRANSIT * DESIGN_HALF_H) / tanX;
    }
    fwd.set(target.x - pos.x, 0, target.z - pos.z).normalize();
    pos.addScaledVector(fwd, -Math.max(0, Math.min(need - dist, room)));

    keys.push({ ...k, pos: pos.toArray(), target: target.toArray() });
    // view offset that puts the lens centre on the clear area's centre
    shifts.push([width / 2 - cx, height / 2 - cy]);
  });
  return { fov, keys, shifts };
}
