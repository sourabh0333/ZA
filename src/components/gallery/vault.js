import { CanvasTexture, Color, Group, MathUtils, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from "three";
import { VAULT } from "./path";

const SMOKE_COUNT = 90;
const VEIL = 16; // dense puffs that fill the opening and hide the chamber
const VEIL_HOLD = 1.8; // seconds the veil stays thick before it thins away
const BURST = 40; // puffs that roll out past the door
const BURST_TIME = 1.2; // seconds
const WISP_RATE = 1.5; // puffs per second while the door stays open
const DOOR_RATE = 1.6; // how quickly the door swings (higher is faster)
const WARM = new Color("#d6a27a");
const COOL = new Color("#9d938a");
const UP = new Vector3(0, 1, 0);

/** Soft, slightly lumpy white puff on a transparent canvas. */
function smokeTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 14; i++) {
    const r = size * (0.16 + Math.random() * 0.2);
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * size * 0.18;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.32)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * The vault's moving parts: the door, re-hung on a pivot at its hinge and
 * swung by scroll progress, and the smoke that rolls out as it opens. The model
 * is exported with the door open (VAULT.openDeg), so the pivot turns back from
 * there to close it.
 */
export class VaultFx {
  angle = 0;
  open = false;
  burstLeft = 0;
  wispClock = 0;
  started = false;

  constructor(scene) {
    this.mouth = new Vector3(...VAULT.mouth);
    this.out = new Vector3(...VAULT.out).normalize();
    this.side = new Vector3().crossVectors(this.out, UP).normalize();

    scene.updateMatrixWorld(true);
    this.pivot = new Group();
    this.pivot.position.set(...VAULT.hinge);
    scene.add(this.pivot);
    this.pivot.updateMatrixWorld(true);
    const doorParts = [];
    scene.traverse((o) => {
      if (o.userData.door && !o.parent?.userData.door) doorParts.push(o);
    });
    for (const o of doorParts) this.pivot.attach(o);

    const map = smokeTexture();
    this.smoke = new Group();
    this.smoke.renderOrder = 10;
    this.puffs = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      this.smoke.add(sprite);
      this.puffs.push({ sprite, age: 0, life: 1, hold: 0, vel: new Vector3(), size0: 1, size1: 1, spin: 0, peak: 0.3 });
    }
    scene.add(this.smoke);
  }

  /** One instance per model: it re-parents the door, so a second would steal it. */
  static for(scene) {
    scene.userData.vaultFx ??= new VaultFx(scene);
    return scene.userData.vaultFx;
  }

  /**
   * veil: a big, nearly opaque puff just inside the opening (the wall clips it
   * to the round hole), which holds and then fades, revealing the chamber.
   * Otherwise a lighter puff that rolls out into the room.
   */
  emit(veil = false) {
    const p = this.puffs.find((q) => !q.sprite.visible);
    if (!p) return;
    const r = VAULT.radius * (veil ? 0.5 : 0.75) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    p.sprite.position
      .copy(this.mouth)
      .addScaledVector(this.out, veil ? -0.25 - Math.random() * 0.5 : -0.2)
      .addScaledVector(this.side, Math.cos(a) * r)
      .addScaledVector(UP, Math.sin(a) * r);
    p.age = 0;
    p.spin = (Math.random() - 0.5) * (veil ? 0.25 : 0.6);
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    if (veil) {
      p.vel.copy(this.out).multiplyScalar(0.05 + Math.random() * 0.08);
      p.hold = VEIL_HOLD + Math.random() * 0.5;
      p.life = p.hold + 1.6 + Math.random() * 0.8;
      p.size0 = 1.6 + Math.random() * 0.4;
      p.size1 = 2.4 + Math.random() * 0.6;
      p.peak = 0.85 + Math.random() * 0.15;
    } else {
      p.vel
        .copy(this.out)
        .multiplyScalar(0.45 + Math.random() * 0.75)
        .addScaledVector(this.side, (Math.random() - 0.5) * 0.5)
        .addScaledVector(UP, (Math.random() - 0.4) * 0.25);
      p.hold = 0;
      p.life = 3.2 + Math.random() * 2.2;
      p.size0 = 0.6 + Math.random() * 0.4;
      p.size1 = 1.9 + Math.random() * 1.2;
      p.peak = 0.3 + Math.random() * 0.2;
    }
    p.sprite.visible = true;
  }

  /** Called every frame with the camera's scroll progress. */
  update(progress, dt) {
    const open = progress >= VAULT.openFrom && progress <= VAULT.openTo;
    if (!this.started) {
      // arriving straight at the vault (a reload, the Rooms menu): no swing
      this.started = true;
      this.angle = open ? VAULT.openDeg : 0;
      this.open = open;
    } else if (open !== this.open) {
      this.open = open;
      if (open) {
        for (let i = 0; i < VEIL; i++) this.emit(true);
        this.burstLeft = BURST;
      }
    }
    const target = this.open ? VAULT.openDeg : 0;
    this.angle += (target - this.angle) * (1 - Math.exp(-Math.min(dt, 0.1) * DOOR_RATE));
    this.pivot.rotation.y = MathUtils.degToRad(this.angle - VAULT.openDeg);

    if (this.burstLeft > 0) {
      const n = Math.min(this.burstLeft, Math.ceil((BURST / BURST_TIME) * dt));
      for (let i = 0; i < n; i++) this.emit();
      this.burstLeft -= n;
    }
    if (this.open) {
      this.wispClock += dt * WISP_RATE;
      while (this.wispClock >= 1) {
        this.wispClock -= 1;
        this.emit();
      }
    }

    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-dt * 0.65));
      p.vel.y -= 0.05 * dt; // cool vapour slowly sinks and spreads along the floor
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = MathUtils.lerp(p.size0, p.size1, 1 - (1 - t) * (1 - t));
      p.sprite.scale.set(s, s, 1);
      // quick fade in, hold (the veil only), then a long fade out
      const inT = Math.min(0.25, p.life * 0.15);
      const holdEnd = Math.max(inT, p.hold);
      let fade = 1;
      if (p.age < inT) fade = p.age / inT;
      else if (p.age > holdEnd) fade = 1 - (p.age - holdEnd) / (p.life - holdEnd);
      p.sprite.material.opacity = p.peak * fade * fade;
      p.sprite.material.rotation += p.spin * dt;
      p.sprite.material.color.copy(WARM).lerp(COOL, Math.min(1, t * 2));
    }
  }
}
