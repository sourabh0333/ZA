"use client";

import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, CanvasTexture, Group, LoopPingPong, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { PEOPLE } from "./visitors";

const urlOf = (p) => `/gallery/people/${p.id}.glb`;
// The walk reaches the rooftop last, so its visitors are fetched only once the
// gallery is showing (Scene.jsx): the poster lifts as soon as everyone below is ready.
export const DOWNSTAIRS = PEOPLE.filter((p) => p.env !== "c");
export const ROOFTOP = PEOPLE.filter((p) => p.env === "c");
export const DOWNSTAIRS_URLS = DOWNSTAIRS.map(urlOf);
export const ROOFTOP_URLS = ROOFTOP.map(urlOf);
// The rooms' light is baked into their textures; the figures are lit live by
// the same reflection maps (diffuse and specular), scaled to sit in that light:
// the dark first rooms need more than the bright exhibition and rooftop halls.
const ENV_LIGHT = { a: 1.7, b: 1.0, c: 1.0 };
const ENV_INDEX = { a: 0, b: 1, c: 2 };
// a figure further than this from the camera is neither animated nor drawn
const NEAR = 16;

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

function contactShadows(p, texture) {
  const list = p.shadows ?? [[p.pos[0], p.pos[1], p.pos[2], 0.8, 0.55, 0.55]];
  return list.map(([x, y, z, w, d, dark]) => {
    const m = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ color: 0x000000, alphaMap: texture, transparent: true, opacity: dark, depthWrite: false }),
    );
    m.rotation.set(-Math.PI / 2, 0, Math.atan2(p.look[0] - p.pos[0], p.look[1] - p.pos[2]));
    m.position.set(x, y + 0.004, z);
    m.renderOrder = 1;
    return m;
  });
}

/**
 * Stands each of the given visitors (gltfs in the same order) in place, lit and
 * grounded, with its idle clip running. Scene.jsx loads the ones downstairs with
 * the rooms and prepares them (shaders, textures, first draw) with the rooms,
 * before the poster lifts; the rooftop's follow once the gallery is showing.
 */
export function stagePeople(people, gltfs, envs) {
  const texture = shadowTexture();
  const mixers = [];
  const actions = [];
  const parts = people.map((p, i) => {
    const { scene, animations } = gltfs[i];
    scene.position.set(...p.pos);
    scene.rotation.y = Math.atan2(p.look[0] - p.pos[0], p.look[1] - p.pos[2]);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      // (the skinned bounds are the bind pose's; the figures are few, so never cull them)
      o.frustumCulled = false;
      o.material.envMap = envs[ENV_INDEX[p.env]];
      o.material.envMapIntensity = ENV_LIGHT[p.env];
    });
    const mixer = new AnimationMixer(scene);
    const action = mixer.clipAction(animations[0]);
    // played forth and back: idle motion reads the same either way, and never jumps
    action.setLoop(LoopPingPong, Infinity);
    action.userData = { at: p.at % animations[0].duration };
    // posed from the start, so even the frames drawn before People mounts show it
    start(action);
    mixer.update(0);
    mixers.push(mixer);
    actions.push(action);
    // the figure and its contact shadows, shown and hidden together
    const figure = new Group();
    figure.add(scene, ...contactShadows(p, texture));
    figure.userData.at = scene.position;
    return figure;
  });
  return { group: parts, mixers, actions };
}

/** Starts an idle clip at its own point, so no two visitors move in step. */
function start(action) {
  action.reset();
  action.time = action.userData.at;
  action.play();
}

/** The visitors, staged by stagePeople. Only the figures near the camera are animated and drawn. */
export default function People({ staged, live }) {
  const { group, mixers, actions } = staged;

  useEffect(() => {
    // (started here as well as at staging: in development React unmounts and
    // remounts once, and the unmount stops them)
    for (const a of actions) if (!a.isRunning()) start(a);
    return () => {
      for (const a of actions) a.stop();
    };
  }, [actions]);

  useFrame((state, dt) => {
    // (until the gallery is live every figure is drawn, so their shaders are ready)
    if (!live) return;
    const eye = state.camera.position;
    group.forEach((figure, i) => {
      // far figures skip their animation, skinning and draw altogether
      const near = eye.distanceTo(figure.userData.at) < NEAR;
      figure.visible = near;
      figure.matrixWorldAutoUpdate = near;
      if (near) mixers[i].update(Math.min(dt, 0.1));
    });
  });

  return group.map((o) => <primitive key={o.uuid} object={o} />);
}
