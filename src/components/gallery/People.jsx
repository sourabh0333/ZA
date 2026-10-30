"use client";

import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationMixer,
  CanvasTexture,
  Group,
  LoopPingPong,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { PEOPLE } from "./visitors";

const urlOf = (p) => `/gallery/people/${p.id}.glb`;
// The visitors in the first view are prepared with the rooms, before the
// gallery opens (every figure shares their shaders, so those are compiled and
// drawn once); the rest are fetched only once the gallery is showing
// (Scene.jsx), in walk order.
export const EARLY = PEOPLE.filter((p) => p.first);
export const LATER = PEOPLE.filter((p) => !p.first);
export const EARLY_URLS = EARLY.map(urlOf);
export const LATER_URLS = LATER.map(urlOf);
// The rooms' light is baked into their textures; the figures are lit live by
// the same reflection maps (diffuse and specular), scaled to sit in that light:
// the dark first rooms need more than the bright exhibition and rooftop halls.
const ENV_LIGHT = { a: 1.7, b: 1.0, c: 1.0 };
const ENV_INDEX = { a: 0, b: 1, c: 2 };
// a figure further than this from the camera is neither animated nor drawn
const NEAR = 16;
// seconds: one clip blending into the next; a stroller turning round
const FADE = 0.5;
const TURN = 1.1;

/** A soft dark ellipse, for grounding figures that cast no real shadow. */
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.35, "#a0a0a0");
  g.addColorStop(1, "#000");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

const UP = new Vector3(0, 1, 0);

/** The figure's contact shadows, in its own frame (it stands at pos, turned by yaw). */
function contactShadows(p, texture, yaw) {
  const list = p.shadows ?? [[p.pos[0], p.pos[1], p.pos[2], 0.8, 0.55, 0.55]];
  return list.map(([x, y, z, w, d, dark]) => {
    const m = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ color: 0x000000, alphaMap: texture, transparent: true, opacity: dark, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x - p.pos[0], y - p.pos[1] + 0.004, z - p.pos[2]).applyAxisAngle(UP, -yaw);
    m.renderOrder = 1;
    return m;
  });
}

/** The heading from a point on the floor plan to another. */
const heading = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);

/** Turns `from` toward `to` the short way round, by fraction t (eased). */
function turn(from, to, t) {
  const d = MathUtils.euclideanModulo(to - from + Math.PI, 2 * Math.PI) - Math.PI;
  return from + d * MathUtils.smoothstep(t, 0, 1);
}

/** One clip, played forth and back: idle motion reads the same either way, and never jumps. */
function standing(p, mixer, clip) {
  const action = mixer.clipAction(clip).setLoop(LoopPingPong, Infinity);
  return {
    start() {
      action.reset();
      action.time = p.at % clip.duration;
      action.play();
    },
    update: (dt) => mixer.update(dt),
  };
}

/** Several clips taking turns, each played a number of times, round and round. */
function acting(p, mixer, clips) {
  const acts = p.acts.map(([name, times]) => {
    const clip = clips.find((c) => c.name === name);
    return { action: mixer.clipAction(clip).setLoop(LoopRepeat, Infinity), length: clip.duration * times };
  });
  let k = 0;
  let left = 0;
  return {
    start() {
      mixer.stopAllAction();
      // (`at` seconds into the round)
      const round = acts.reduce((sum, a) => sum + a.length, 0);
      let t = p.at % round;
      k = 0;
      while (t >= acts[k].length) t -= acts[k++].length;
      left = acts[k].length - t;
      acts[k].action.reset();
      acts[k].action.time = t;
      acts[k].action.play();
    },
    update(dt) {
      left -= dt;
      if (left <= 0) {
        const from = acts[k].action;
        k = (k + 1) % acts.length;
        left = acts[k].length;
        acts[k].action.reset().play();
        acts[k].action.crossFadeFrom(from, FADE, false);
      }
      mixer.update(dt);
    },
  };
}

/**
 * Strolls from pos to walk.to and back: walking on the spot (as baked) while
 * the figure moves at the walk's own speed, so the feet never slide; at each
 * end it turns to that end's look point and plays its second clip, then turns
 * and walks back.
 */
function strolling(p, mixer, clips, figure, speed) {
  const walk = mixer.clipAction(clips[0]).setLoop(LoopRepeat, Infinity);
  const pause = mixer.clipAction(clips[1]).setLoop(LoopRepeat, Infinity);
  const ends = [new Vector3(p.pos[0], p.pos[1], p.pos[2]), new Vector3(p.walk.to[0], p.pos[1], p.walk.to[1])];
  const towards = new Vector3();
  let leg = 1; // the end it is walking to
  let paused = false;
  let clock = 0; // seconds since it last set off or stopped
  let yawFrom = 0;
  let yawTo = 0;

  const face = (yaw) => {
    yawFrom = figure.rotation.y;
    yawTo = yaw;
  };
  return {
    start() {
      mixer.stopAllAction();
      leg = 1;
      paused = false;
      clock = TURN;
      figure.position.lerpVectors(ends[0], ends[1], p.walk.start ?? 0);
      figure.rotation.y = yawFrom = yawTo = heading(ends[0].x, ends[0].z, ends[1].x, ends[1].z);
      walk.reset();
      walk.time = p.at % clips[0].duration;
      walk.play();
    },
    update(dt) {
      clock += dt;
      figure.rotation.y = turn(yawFrom, yawTo, clock / TURN);
      if (paused) {
        if (clock >= pause.getClip().duration * p.walk.pause) {
          // set off back the other way
          leg = 1 - leg;
          paused = false;
          clock = 0;
          face(heading(figure.position.x, figure.position.z, ends[leg].x, ends[leg].z));
          walk.reset().play();
          walk.crossFadeFrom(pause, FADE, false);
        }
      } else {
        // (eases into its stride as it finishes turning)
        const step = speed * dt * MathUtils.smoothstep(clock, TURN * 0.4, TURN);
        towards.subVectors(ends[leg], figure.position);
        const left = towards.length();
        if (left <= step) {
          // arrived: stop and look
          figure.position.copy(ends[leg]);
          paused = true;
          clock = 0;
          const [lx, lz] = p.walk.looks[leg];
          face(heading(figure.position.x, figure.position.z, lx, lz));
          pause.reset().play();
          pause.crossFadeFrom(walk, FADE, false);
        } else {
          figure.position.addScaledVector(towards, step / left);
        }
      }
      mixer.update(dt);
    },
  };
}

/**
 * Stands each of the given visitors (gltfs in the same order) in place, lit and
 * grounded, doing what it does (visitors.js). Scene.jsx prepares the ones in the
 * first view (shaders, textures, first draw) with the rooms, before the poster
 * lifts; the others follow once the gallery is showing.
 */
export function stagePeople(people, gltfs, envs) {
  const texture = shadowTexture();
  const mixers = [];
  const behaviours = [];
  const parts = people.map((p, i) => {
    const { scene, animations } = gltfs[i];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      // (the skinned bounds are the bind pose's; the figures are few, so never cull them)
      o.frustumCulled = false;
      o.material.envMap = envs[ENV_INDEX[p.env]];
      o.material.envMapIntensity = ENV_LIGHT[p.env] * (p.light ?? 1);
    });
    // the figure and its contact shadows, placed, turned and shown together
    const yaw = heading(p.pos[0], p.pos[2], p.look[0], p.look[1]);
    const figure = new Group();
    figure.position.set(...p.pos);
    figure.rotation.y = yaw;
    figure.add(scene, ...contactShadows(p, texture, yaw));
    const mixer = new AnimationMixer(scene);
    let speed = 0;
    scene.traverse((o) => {
      speed ||= o.userData.walkSpeed ?? 0;
    });
    const behaviour = p.walk
      ? strolling(p, mixer, animations, figure, speed)
      : p.acts
        ? acting(p, mixer, animations)
        : standing(p, mixer, animations[0]);
    // posed from the start, so even the frames drawn before People mounts show it
    behaviour.start();
    mixer.update(0);
    mixers.push(mixer);
    behaviours.push(behaviour);
    return figure;
  });
  return { group: parts, mixers, behaviours };
}

/** The visitors, staged by stagePeople. Only the figures near the camera are animated and drawn. */
export default function People({ staged, live }) {
  const { group, mixers, behaviours } = staged;

  useEffect(() => {
    // (started here as well as at staging: in development React unmounts and
    // remounts once, and the unmount stops them)
    for (const b of behaviours) b.start();
    return () => {
      for (const m of mixers) m.stopAllAction();
    };
  }, [mixers, behaviours]);

  useFrame((state, dt) => {
    // (until the gallery is live every figure is drawn, so their shaders are ready)
    if (!live) return;
    const eye = state.camera.position;
    group.forEach((figure, i) => {
      // far figures skip their animation, skinning and draw altogether
      const near = eye.distanceTo(figure.position) < NEAR;
      figure.visible = near;
      figure.matrixWorldAutoUpdate = near;
      if (near) behaviours[i].update(Math.min(dt, 0.1));
    });
  });

  return group.map((o) => <primitive key={o.uuid} object={o} />);
}
