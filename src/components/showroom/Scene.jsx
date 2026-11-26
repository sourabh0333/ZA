"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  AgXToneMapping,
  Color,
  EquirectangularReflectionMapping,
  Group,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  PointLight,
  RectAreaLight,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import "./grade";
import { DOORS, FOV, PRODUCTS, samplePath } from "./path";
// (the showroom's store is provided through the gallery's context, so the shared header finds it too)
import { useGallery as useShowroom } from "../gallery/store";
import styles from "../gallery/gallery.module.css";

// The showroom's 3D view: the home (scene/build_showroom.py), lit live in the
// browser, no baked light: daylight through each window (an area light the
// size of the glass), a few warm lights in each room, the garden view outside
// as the background and, blurred, as the reflections; graded like the
// gallery (AgX and the same contrast lift in every material's shader); the
// camera on the walk, and each work's eye icon and card kept on it.
export const MODEL_URL = "/showroom/model/showroom.glb";
export const SKY_URL = "/showroom/sky.webp";
RectAreaLightUniformsLib.init();

export const withMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);
useLoader.preload(GLTFLoader, MODEL_URL, withMeshopt);
useLoader.preload(TextureLoader, SKY_URL);

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const UPLOAD_BUDGET = 40; // ms of texture uploads per frame while the intro covers the view
const DESIGN_HALF_H = Math.tan(MathUtils.degToRad(31)); // the walk is composed for a 4:3 screen
const MAX_FOV = 72; // vertical; wider and the rooms start to bend
// scroll progress over which the first view's welcome fades out
const WELCOME_FROM = 0.002;
const WELCOME_TO = 0.02;
const BRIGHT_FROM = -1; // the home is light throughout: the header keeps its tab
const EDGE = 16; // px the card keeps from the screen's edges
const CARD_GAP = 22; // px between an eye icon and its card
const BOTTOM_BAR = 56; // px the Rooms bar takes at the foot of the stage
const RANGE_MARGIN = 0.015; // of the walk, either side of a work's stretch
const EYE_EDGE = 24; // px an eye icon keeps from the screen's edges (nearer, it hides)
const ENV_INTENSITY = 0.45; // the garden view, blurred: soft fill and reflections
const ART_GLOW = 0.15; // the works lit a little from within, as if under their own spots
const SKY_TURN = MathUtils.degToRad(90); // the mountains through the garden glass

// The rooms' lights, warm, under the ceiling (three.js axes: x east, y up, z
// south): [x, y, z, intensity, reach in metres].
const LIGHTS = [
  [6.8, 2.5, -1.6, 6, 6], [6.8, 2.5, -3.8, 4, 5], // foyer
  [2.6, 2.6, -8.5, 6, 8], [5.0, 2.6, -6.2, 3, 6], // living room
  [8.8, 2.4, -8.6, 5, 7], // dining room
  [13.2, 2.6, -8.5, 6, 8], [15.2, 2.6, -10.8, 3, 6], // kitchen
  [11.2, 2.6, -2.4, 5, 7], // bedroom
  [14.7, 2.6, -2.4, 4, 6], // bathroom
];
// Daylight from each window: [centre x, y, z, width, height, the point it faces, intensity]
const WINDOWS = [
  [5.5, 1.3, -11.95, 9.8, 2.6, [5.5, 1.3, 0], 2.5], // the garden glass
  [13.4, 1.72, -11.95, 3.6, 1.35, [13.4, 1.0, -6], 3], // over the kitchen sink
  [11.0, 1.5, -0.05, 2.8, 2.1, [11.0, 1.2, -5], 2.5], // the bedroom's
  [14.7, 1.5, -0.05, 1.4, 1.0, [14.7, 1.0, -5], 3], // the bathroom's
];

/** Lights the rooms live: the room lights and a dim sky-and-floor fill, added
 * to the model so its shaders are compiled for them from the start. */
function light(scene, gl) {
  // (once per model: the loader caches it, and React may render twice)
  if (scene.userData.lit) return;
  scene.userData.lit = true;
  const aniso = Math.min(4, gl.capabilities.getMaxAnisotropy());
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const web = obj.material.userData.web || {};
    const mat = obj.material.clone();
    // the works glow faintly with their own colours, so they read in any light
    if (mat.name.startsWith("art_") && mat.map) {
      mat.emissive = new Color(1, 1, 1);
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = ART_GLOW;
    }
    // (the glossy stone and metal take more of the reflections than the plaster)
    mat.envMapIntensity = Math.max(0.25, Math.min(1.2, (web.env ?? 0.3) * 1.6));
    for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
      if (mat[key]) mat[key].anisotropy = aniso;
    }
    obj.material = mat;
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
  });
  scene.add(new HemisphereLight("#fff6ea", "#5a4a3a", 0.45));
  for (const [x, y, z, intensity, reach] of LIGHTS) {
    const l = new PointLight("#ffd6aa", intensity, reach, 1.3);
    l.position.set(x, y, z);
    scene.add(l);
  }
  for (const [x, y, z, w, h, to, intensity] of WINDOWS) {
    const l = new RectAreaLight("#f4f6ff", intensity, w, h);
    l.position.set(x, y, z);
    l.lookAt(...to);
    scene.add(l);
  }
  hangDoors(scene);
}

// Each door's leaf (and its levers) hung on a pivot at its hinge, turned by syncFrame.
let hungDoors = [];

function hangDoors(scene) {
  scene.updateMatrixWorld(true);
  hungDoors = DOORS.map((d) => {
    const pivot = new Group();
    pivot.position.set(...d.hinge);
    scene.add(pivot);
    pivot.updateMatrixWorld(true);
    const parts = [];
    scene.traverse((o) => {
      if (o.userData.door === d.id) parts.push(o);
    });
    for (const o of parts) pivot.attach(o);
    return { ...d, pivot };
  });
}

/** 0 to 1 across [a, b], eased at both ends. */
function ease(a, b, p) {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The garden outside as the background, and blurred as the reflections (made once, while the intro is up). */
function useGarden() {
  const sky = useLoader(TextureLoader, SKY_URL);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene: root } = get();
    // (a copy set up as a panorama: the loader's own is shared)
    const view = sky.clone();
    view.mapping = EquirectangularReflectionMapping;
    view.colorSpace = SRGBColorSpace;
    view.needsUpdate = true;
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromEquirectangular(view).texture;
    pmrem.dispose();
    root.background = view;
    root.backgroundRotation.set(0, SKY_TURN, 0);
    root.environment = env;
    root.environmentIntensity = ENV_INTENSITY;
    root.environmentRotation.set(0, SKY_TURN, 0);
    return () => {
      root.background = null;
      root.environment = null;
      env.dispose();
      view.dispose();
    };
  }, [get, sky]);
}

/** Every texture the meshes under root use. */
function texturesOf(root) {
  const found = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const v of Object.values(o.material)) if (v?.isTexture && !v.isRenderTargetTexture) found.add(v);
  });
  return [...found];
}

function Rooms({ onReady }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, withMeshopt);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const root = useThree((s) => s.scene);
  const store = useShowroom();
  useMemo(() => light(gltf.scene, gl), [gltf, gl]);
  useGarden();
  const [shown, setShown] = useState(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  // While the intro covers the view: every shader compiled in parallel, the
  // textures uploaded a few at a time (so the page never freezes), then one
  // frame drawn before the view is handed over.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      store.setPrep(0.05);
      const compiled = gl.compileAsync(gltf.scene, camera, root);
      const textures = texturesOf(gltf.scene);
      const total = textures.length;
      while (textures.length) {
        if (cancelled) return;
        const start = performance.now();
        do gl.initTexture(textures.pop());
        while (textures.length && performance.now() - start < UPLOAD_BUDGET);
        store.setPrep(0.05 + 0.8 * (1 - textures.length / total));
        await nextFrame();
      }
      await compiled;
      if (cancelled) return;
      setShown(true);
      await nextFrame();
      await nextFrame();
      if (cancelled) return;
      store.setPrep(1);
      onReadyRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [gl, camera, root, gltf, store]);

  return shown ? <primitive object={gltf.scene} /> : null;
}

const tmpPos = new Vector3();
const tmpTarget = new Vector3();
const eye = new Vector3();
const eyeView = new Vector3();
const PRODUCT_POS = new Map(PRODUCTS.map((w) => [w.id, new Vector3(...w.pos)]));

/** Where a point is on screen in px, or null if it is behind the camera or not well inside the screen. */
function onScreen(p, camera, size) {
  if (eyeView.copy(p).applyMatrix4(camera.matrixWorldInverse).z > -0.2) return null;
  eye.copy(p).project(camera);
  const x = ((eye.x + 1) / 2) * size.width;
  const y = ((1 - eye.y) / 2) * size.height;
  if (x < EYE_EDGE || x > size.width - EYE_EDGE || y < EYE_EDGE || y > size.height - BOTTOM_BAR) return null;
  return { x, y };
}

/** Moves the camera along the walk and keeps the eye icons and the open card on their works. */
function syncFrame(store, camera, size, dt, flags) {
  const p = store.step(dt);
  samplePath(p, tmpPos, tmpTarget);
  camera.position.copy(tmpPos);
  camera.lookAt(tmpTarget);
  camera.updateMatrixWorld();

  // the doors: open as the walk comes to them, the bedroom's shut behind it
  for (const d of hungDoors) {
    const open = ease(d.open[0], d.open[1], p) * (d.close ? 1 - ease(d.close[0], d.close[1], p) : 1);
    d.pivot.rotation.y = MathUtils.degToRad(d.openDeg) * open;
  }

  let openAt = null;
  for (const w of PRODUCTS) {
    const el = store.eyeEls.get(w.id);
    if (!el) continue;
    // (a margin either side: the camera eases to a stop a hair short of it)
    const at = p >= w.range[0] - RANGE_MARGIN && p <= w.range[1] + RANGE_MARGIN ? onScreen(PRODUCT_POS.get(w.id), camera, size) : null;
    const show = Boolean(at);
    if (show !== flags.eyes[w.id]) {
      flags.eyes[w.id] = show;
      el.setAttribute("data-visible", String(show));
      el.tabIndex = show ? 0 : -1;
    }
    if (at) el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
    if (store.open === w.id) openAt = at;
  }
  // the open card stays beside its icon, and closes once the walk moves on
  if (store.open) {
    if (!openAt) store.setOpen(null);
    else if (store.cardEl && size.width > 640) {
      const card = store.cardEl;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const left = openAt.x > size.width * 0.55;
      const x = left ? openAt.x - CARD_GAP - w : openAt.x + CARD_GAP;
      const top = (store.headerEl?.offsetHeight ?? 64) + 12;
      const y = Math.min(Math.max(openAt.y - 24, top), size.height - BOTTOM_BAR - h);
      card.style.transform = `translate3d(${Math.min(Math.max(x, EDGE), size.width - w - EDGE).toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      card.setAttribute("data-side", left ? "left" : "right");
    }
  }

  const away = Math.min(1, Math.max(0, (p - WELCOME_FROM) / (WELCOME_TO - WELCOME_FROM)));
  if (store.welcomeEl && away !== flags.away) {
    flags.away = away;
    store.welcomeEl.style.setProperty("--away", away.toFixed(3));
  }
  const bright = p > BRIGHT_FROM;
  if (bright !== flags.bright && store.headerEl) {
    flags.bright = bright;
    store.headerEl.setAttribute("data-tab", String(bright));
  }
}

function CameraRig() {
  const store = useShowroom();
  const flags = useRef({ bright: false, eyes: {}, away: -1 });
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  // On screens narrower than the 4:3 the walk is composed for, the lens
  // widens (up to a point) so each room keeps its width in view.
  useEffect(() => {
    const { camera } = get();
    const aspect = size.width / size.height;
    const half = Math.atan(DESIGN_HALF_H / aspect);
    const fov = Math.min(MAX_FOV, Math.max(FOV, MathUtils.radToDeg(2 * half)));
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [get, size.width, size.height]);
  useFrame((state, dt) => syncFrame(store, state.camera, state.size, dt, flags.current));
  return null;
}

const GL = {
  antialias: true,
  powerPreference: "high-performance",
  stencil: false,
  toneMapping: AgXToneMapping,
};

export default function Scene({ onReady }) {
  // one canvas pixel per CSS pixel at first, sharper (up to 1.5) once frames show the headroom
  const [maxDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.5));
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1));
  const [live, setLive] = useState(false);

  return (
    <Canvas className={styles.canvas} dpr={dpr} camera={{ fov: FOV, near: 0.05, far: 80, position: [4.25, 1.55, 1.9] }} gl={GL}>
      {live && maxDpr > 1 && (
        <PerformanceMonitor
          bounds={(refresh) => (refresh > 100 ? [70, 100] : [50, 59])}
          flipflops={3}
          onIncline={() => setDpr(maxDpr)}
          onDecline={() => setDpr(1)}
          onFallback={() => setDpr(1)}
        />
      )}
      <Suspense fallback={null}>
        <Rooms
          onReady={() => {
            onReady?.();
            setLive(true);
          }}
        />
        <CameraRig />
      </Suspense>
    </Canvas>
  );
}
