import { Frustum, ImageBitmapLoader, Matrix4, SRGBColorSpace, Texture, Vector3 } from "three";
import catalogue from "./data/catalogue.json";
import { WORKS } from "./path";

// The hang: once the gallery is showing, the frames take works from the
// Zigguratss catalogue (data/catalogue.json, fetched by
// scene/tools/fetch-zigguratss.mjs), each of about its frame's proportions and
// cropped to fill it, a new set every visit; then, every little while, a few
// frames out of view change to the next work, so a room shows something new
// when the walk comes back to it. A work in view never changes before the
// visitor's eyes. The vault's gilded works stay: they are its treasure.
const FIXED = new Set(["vault_l", "vault_c", "vault_r"]);
const FIT = Math.log(1.25); // a work hangs in a frame within a quarter of its proportions
const ROTATE_EVERY = 15000; // ms between changes
const AT_ONCE = 3; // frames changed each time, out of view
const STAY = 45000; // ms a work hangs at least
// metres: a frame further from the camera than this changes even in the lens
// (it shows small, and the frustum cannot tell when a wall is in the way)
const NOTICE = 14;
const WALK_ORDER = new Map(WORKS.map((w, i) => [w.id, i]));

/** A shuffled copy (a new order every visit). */
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Hanging {
  /**
   * scene: the gallery's glTF scene (its paintings' materials are named art_<id>);
   * onHung(id, work): a frame now shows `work` (a catalogue entry).
   */
  constructor(scene, gl, camera, onHung) {
    this.gl = gl;
    this.camera = camera;
    this.onHung = onHung;
    this.loader = new ImageBitmapLoader().setOptions({ imageOrientation: "none" });
    this.frames = [];
    scene.traverse((o) => {
      const id = o.isMesh && o.material.name?.startsWith("art_") ? o.material.name.slice(4) : null;
      if (!id || FIXED.has(id) || !o.material.map?.image) return;
      const { width, height } = o.material.map.image;
      this.frames.push({ id, mesh: o, aspect: width / height, work: null, since: 0 });
    });
    this.frames.sort((a, b) => (WALK_ORDER.get(a.id) ?? 99) - (WALK_ORDER.get(b.id) ?? 99));
    this.queue = shuffled(catalogue);
    this.stopped = false;
    this.frustum = new Frustum();
    this.view = new Matrix4();
    this.at = new Vector3();
  }

  /** The next work in the queue that fits the frame and hangs nowhere else. */
  pick(frame) {
    const hung = new Set(this.frames.map((f) => f.work?.id));
    const fits = (w) => !hung.has(w.id) && Math.abs(Math.log(w.aspect / frame.aspect)) < FIT;
    let i = this.queue.findIndex(fits);
    if (i < 0) {
      // (nothing of its shape left in the queue: the closest in shape)
      const free = this.queue.filter((w) => !hung.has(w.id));
      if (!free.length) return null;
      const best = free.reduce((a, b) => (Math.abs(Math.log(a.aspect / frame.aspect)) < Math.abs(Math.log(b.aspect / frame.aspect)) ? a : b));
      i = this.queue.indexOf(best);
    }
    // (to the back of the queue, so the whole catalogue comes round)
    const [w] = this.queue.splice(i, 1);
    this.queue.push(w);
    return w;
  }

  /** Whether the visitor can see the frame now: in the lens and near enough to tell (walls aside). */
  inView(frame) {
    const cam = this.camera;
    frame.mesh.getWorldPosition(this.at);
    if (this.at.distanceTo(cam.position) > NOTICE) return false;
    this.view.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.view);
    return this.frustum.intersectsObject(frame.mesh);
  }

  /** Loads the work, crops it to the frame (centred) and hangs it. */
  async hang(frame, work) {
    const bitmap = await this.loader.loadAsync(work.image);
    if (this.stopped) return;
    const tex = new Texture(bitmap);
    tex.flipY = false;
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = Math.min(4, this.gl.capabilities.getMaxAnisotropy());
    // cover: the work fills the canvas, its overhang cropped evenly
    const r = work.aspect / frame.aspect;
    if (r > 1) tex.repeat.set(1 / r, 1);
    else tex.repeat.set(1, r);
    tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
    tex.needsUpdate = true;
    // (uploaded now, outside any frame's draw)
    this.gl.initTexture(tex);
    const mat = frame.mesh.material;
    const old = mat.map;
    mat.map = tex;
    if (frame.work) old.dispose(); // (the designed works' own maps stay, unseen)
    frame.work = work;
    frame.since = performance.now();
    this.onHung(frame.id, work);
  }

  /** The first hang, frame by frame along the walk, then the rotation. */
  async start() {
    for (const frame of this.frames) {
      if (this.stopped) return;
      // (a frame in view keeps its work until it is out of view)
      if (this.inView(frame)) continue;
      const work = this.pick(frame);
      if (work) await this.hang(frame, work).catch(() => {});
    }
    this.timer = setInterval(() => this.rotate(), ROTATE_EVERY);
  }

  rotate() {
    const now = performance.now();
    const due = this.frames.filter((f) => now - f.since > STAY && !this.inView(f));
    for (const frame of shuffled(due).slice(0, AT_ONCE)) {
      const work = this.pick(frame);
      if (work) this.hang(frame, work).catch(() => {});
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
  }
}
