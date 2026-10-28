"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { AnimationMixer, CanvasTexture, LoopPingPong, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { PEOPLE } from "./visitors";

const URLS = PEOPLE.map((p) => `/gallery/people/${p.id}.glb`);
// The rooms' light is baked into their textures; the figures are lit live by
// the same reflection maps (diffuse and specular), scaled to sit in that light:
// the dark first rooms need more than the bright exhibition hall.
const ENV_LIGHT = { a: 1.7, b: 1.0 };

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

/** Stands each figure in place, lit and grounded, with its idle clip running. */
function stagePeople(gltfs, envs) {
  const texture = shadowTexture();
  const mixers = [];
  const parts = PEOPLE.flatMap((p, i) => {
    const { scene, animations } = gltfs[i];
    scene.position.set(...p.pos);
    scene.rotation.y = Math.atan2(p.look[0] - p.pos[0], p.look[1] - p.pos[2]);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      // (the skinned bounds are the bind pose's; the figures are few, so never cull them)
      o.frustumCulled = false;
      o.material.envMap = envs[p.env === "b" ? 1 : 0];
      o.material.envMapIntensity = ENV_LIGHT[p.env];
    });
    const mixer = new AnimationMixer(scene);
    const action = mixer.clipAction(animations[0]);
    // played forth and back: idle motion reads the same either way, and never jumps
    action.setLoop(LoopPingPong, Infinity);
    action.time = p.at % animations[0].duration;
    action.play();
    mixers.push(mixer);
    return [scene, ...contactShadows(p, texture)];
  });
  return { group: parts, mixers };
}

/** The visitors: loaded once the rooms are on screen, so they never hold up the first frame. */
export default function People({ envs }) {
  const gltfs = useLoader(GLTFLoader, URLS, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));

  const { group, mixers } = useMemo(() => stagePeople(gltfs, envs), [gltfs, envs]);

  useEffect(
    () => () => {
      for (const m of mixers) m.stopAllAction();
    },
    [mixers],
  );
  useFrame((_, dt) => {
    for (const m of mixers) m.update(Math.min(dt, 0.1));
  });

  return group.map((o) => <primitive key={o.uuid} object={o} />);
}
