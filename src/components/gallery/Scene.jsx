"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  AgXToneMapping,
  CubeUVReflectionMapping,
  Frustum,
  Group,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  ShaderChunk,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import lightmaps from "./data/lightmaps.json";
import { frame, measureGallery } from "./framing";
import { BRIGHT_FROM, FOV, LABELS, samplePath, setFraming, VAULT, WORKS, ZONES } from "./path";
import People, { EARLY, EARLY_URLS, LATER, LATER_URLS, stagePeople } from "./People";
import { useGallery } from "./store";
import { VaultFx } from "./vault";
import styles from "./gallery.module.css";

const MODEL_URL = "/gallery/model/gallery.glb";
// reflection maps, prefiltered at build time (scene/tools/pmrem.mjs): dark gallery, frame B, rooftop
const ENV_URLS = ["/gallery/env_a.pmrem.hdr", "/gallery/env_b.pmrem.hdr", "/gallery/env_c.pmrem.hdr"];
const LM_NAMES = Object.keys(lightmaps);
const LM_URLS = LM_NAMES.map((n) => lightmaps[n].file);
const EXPOSURE = 1.0;
// Baked light already contains the room's indirect light, so the environment
// map is used for reflections only: drop its diffuse (irradiance) term.
const LIGHTS_FRAGMENT_MAPS = ShaderChunk.lights_fragment_maps.replace(
  "iblIrradiance += getIBLIrradiance( geometryNormal );",
  "",
);

// The look of Blender's "AgX - Medium High Contrast" renders, applied in every
// material's own shader rather than in a post-processing pass (which cost a full
// extra pass over the screen each frame): AgX tone mapping, then the same small
// contrast lift the old BrightnessContrast(-0.02, 0.16) effect gave.
// (the lift works on display values, as the effect did: in linear light it
// would crush every shadow to black)
ShaderChunk.tonemapping_fragment = `
#if defined( TONE_MAPPING )
  gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
  vec3 graded = ( pow( max( gl_FragColor.rgb, 0.0 ), vec3( 1.0 / 2.2 ) ) - 0.52 ) / 0.84 + 0.5;
  gl_FragColor.rgb = pow( max( graded, 0.0 ), vec3( 2.2 ) );
#endif
`;

// Start every download at once (useLoader would otherwise suspend on each in turn).
const withMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);
useLoader.preload(GLTFLoader, MODEL_URL, withMeshopt);
// The lightmaps are decoded off the main thread as they arrive (as the model's
// own textures are): loaded as plain images, each was decoded only when it was
// uploaded, which held the main thread for a tenth of a second per map.
const asBitmaps = (loader) => loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });
useLoader.preload(ImageBitmapLoader, LM_URLS, asBitmaps);
useLoader.preload(HDRLoader, ENV_URLS);
useLoader.preload(GLTFLoader, EARLY_URLS, withMeshopt);

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
// ms of texture uploads per frame: while the poster covers the view, as much as
// keeps the page responsive (under 50 ms a task); once the view is live, a little
const UPLOAD_BUDGET = 40;
const LIVE_UPLOAD_BUDGET = 6;
// How far the first view's textures reach: anything nearer, inside a lens a
// little wider than the camera's (for the lens shift), is ready before the poster lifts.
const FIRST_VIEW_REACH = 16;
const FIRST_VIEW_WIDEN = 1.3;
const FIRST_DRAWS = 3; // shaders given their first draw per frame while the poster is up
const MAP_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "lightMap", "envMap", "alphaMap", "aoMap"];

/** What the GPU driver builds a shader variant for: the material's features and the mesh's vertex layout. */
function drawSignature(o) {
  const m = o.material;
  const maps = MAP_SLOTS.filter((k) => m[k]).join(",");
  const attributes = Object.keys(o.geometry?.attributes ?? {}).sort().join(",");
  return [m.type, maps, m.transparent, m.side, m.vertexColors, o.isSkinnedMesh, o.isSprite, m.customProgramCacheKey(),
    JSON.stringify(m.defines ?? {}), attributes].join("|");
}


/** The textures an object's material uses (not render targets: those live on the GPU already). */
function texturesOfObject(o, found = new Set()) {
  for (const v of Object.values(o.material ?? {})) if (v?.isTexture && !v.isRenderTargetTexture) found.add(v);
  return found;
}

/** Every texture the meshes under root use. */
function texturesOf(root) {
  const found = new Set();
  root.traverse((o) => {
    if (o.isMesh) texturesOfObject(o, found);
  });
  return [...found];
}

/** The camera where the walk starts (or wherever the page was scrolled to), with a wider lens. */
function firstView(store, camera) {
  const eye = camera.clone();
  samplePath(store.target, tmpPos, tmpTarget, tmpShift);
  eye.position.copy(tmpPos);
  eye.lookAt(tmpTarget);
  eye.fov = Math.min(150, camera.fov * FIRST_VIEW_WIDEN);
  eye.updateProjectionMatrix();
  eye.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse));
  return { eye: eye.position.clone(), frustum };
}

/** How far an object's nearest point is from the first view's eye, and whether it is inside its lens. */
function seenFrom(o, view) {
  if (!o.geometry) return { d: Infinity, seen: false };
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  const sphere = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
  return { d: Math.max(0, sphere.center.distanceTo(view.eye) - sphere.radius), seen: view.frustum.intersectsSphere(sphere) };
}

/** Which parts of the building to draw over which stretch of the walk (path.json "zones"). */
function zonesOf(root) {
  return ZONES.map((z) => {
    const objects = [];
    root.traverse((o) => {
      if (z.groups.includes(o.userData.lightmap)) objects.push(o);
    });
    return { objects, range: z.range, shown: true };
  });
}

function specularOnlyEnv(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", LIGHTS_FRAGMENT_MAPS);
  };
  material.customProgramCacheKey = () => "baked-lightmap";
}

/** Binds each mesh to its group's lightmap and reflection map; returns how many were baked. */
function prepareGallery(scene, lmTextures, envs, gl) {
  // (2x keeps floors crisp at grazing angles; 8x cost a quarter of the frame on integrated GPUs)
  const aniso = Math.min(2, gl.capabilities.getMaxAnisotropy());
  // already PMREM atlases: used as they are, never refiltered in the browser
  for (const env of envs) {
    env.mapping = CubeUVReflectionMapping;
    env.minFilter = LinearFilter;
    env.magFilter = LinearFilter;
    env.generateMipmaps = false;
    env.needsUpdate = true;
  }
  const [envA, envB] = envs;
  const envByName = { a: envs[0], b: envs[1], c: envs[2] };
  const lmByName = {};
  LM_NAMES.forEach((n, i) => {
    const t = lmTextures[i];
    t.channel = 1;
    t.flipY = false;
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.needsUpdate = true;
    lmByName[n] = t;
  });
  let baked = 0;
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    let owner = obj;
    while (owner && !owner.userData.lightmap) owner = owner.parent;
    const name = owner?.userData.lightmap;
    const info = lightmaps[name];
    const web = obj.material.userData.web || {};
    const mat = obj.material.clone();
    const door = obj.userData.door || obj.parent?.userData.door;
    if (door) {
      // the swinging vault door is lit live by the room's reflection map
      mat.envMap = envB;
      mat.envMapIntensity = 1.0;
    } else if (web.emissive) {
      mat.emissiveIntensity *= EXPOSURE;
    } else if (info) {
      baked += 1;
      mat.lightMap = lmByName[name];
      mat.lightMapIntensity = info.intensity * Math.PI * EXPOSURE;
      mat.envMap = envByName[info.env] ?? envA;
      mat.envMapIntensity = (web.env ?? 0.4) * EXPOSURE;
      specularOnlyEnv(mat);
    }
    for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
      if (mat[key]) mat[key].anisotropy = aniso;
    }
    obj.material = mat;
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
  });
  return baked;
}

const tmpPos = new Vector3();
const tmpTarget = new Vector3();
const tmpShift = [0, 0];
const tmpProj = new Vector3();
const EDGE = 16; // px a wall label keeps from the screen's edges
const LABEL_GAP = 12; // px between a work's frame and its label
const STACK_GAP = 4; // px between labels stacked under one another
const BOTTOM_BAR = 56; // px the Rooms bar takes at the foot of the stage
// scroll progress over which the first view's welcome fades out
const WELCOME_FROM = 0.002;
const WELCOME_TO = 0.02;

// Each work's wall label shows from halfway to its stop until halfway on to the
// next: it is up while the camera arrives at the work and holds on it.
const LABEL_SHOWS = Object.fromEntries(
  WORKS.map((w) => {
    const at = LABELS.find((l) => l.id.split("-").includes(w.id))?.range[0] ?? (w.range[0] + w.range[1]) / 2;
    return [w.id, [(w.range[0] + at) / 2, (at + w.range[1]) / 2]];
  }),
);
const corner = new Vector3();

/**
 * Where a work's frame is on screen, in px: { left, right, top, bottom, seen }
 * (seen: the share of it inside the screen), or null when any of it is behind
 * the camera.
 */
function frameOnScreen(corners, camera, size) {
  const f = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const c of corners) {
    corner.copy(c);
    if (tmpProj.copy(corner).applyMatrix4(camera.matrixWorldInverse).z > -0.1) return null;
    corner.project(camera);
    const x = ((corner.x + 1) / 2) * size.width;
    const y = ((1 - corner.y) / 2) * size.height;
    f.left = Math.min(f.left, x);
    f.right = Math.max(f.right, x);
    f.top = Math.min(f.top, y);
    f.bottom = Math.max(f.bottom, y);
  }
  const inX = Math.max(0, Math.min(f.right, size.width) - Math.max(f.left, 0));
  const inY = Math.max(0, Math.min(f.bottom, size.height) - Math.max(f.top, 0));
  f.seen = (inX * inY) / ((f.right - f.left) * (f.bottom - f.top));
  return f;
}

/** Where a work's label goes: under its frame, left-aligned with it; beside it where there is no room below. */
function labelSpot(el, f, size) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const floor = size.height - BOTTOM_BAR;
  let x = Math.min(Math.max(f.left, EDGE), size.width - w - EDGE);
  let y = f.bottom + LABEL_GAP;
  if (y + h > floor) {
    // no room below: beside the frame, level with its foot, on whichever side has room
    y = Math.min(f.bottom - h, floor - h);
    if (f.right + LABEL_GAP + w <= size.width - EDGE) x = f.right + LABEL_GAP;
    else if (f.left - LABEL_GAP - w >= EDGE) x = f.left - LABEL_GAP - w;
    else y = floor - h; // (a work wider than the screen: over its foot)
  }
  return { el, x, y, w, h };
}

/**
 * Lays out the labels showing together (works hung close, like the vault's):
 * any that would overlap share one line, side by side in the order of their
 * works, the line moved left as a whole if it runs off the screen, or
 * stacked if even that will not fit.
 */
function placeLabels(spots, size) {
  spots.sort((a, b) => a.x - b.x);
  for (let i = 1; i < spots.length; i++) {
    const prev = spots[i - 1];
    const s = spots[i];
    if (s.x < prev.x + prev.w + LABEL_GAP && s.y < prev.y + prev.h && prev.y < s.y + s.h) {
      s.x = prev.x + prev.w + LABEL_GAP;
      s.y = prev.y = Math.max(prev.y, s.y);
    }
  }
  const last = spots[spots.length - 1];
  const over = last ? last.x + last.w + EDGE - size.width : 0;
  if (over > 0 && spots[0].x - over < EDGE) {
    // too wide for the screen (a phone): stacked under one another instead,
    // lifted if the stack would run into the Rooms bar
    const wide = Math.max(...spots.map((s) => s.w));
    const x = Math.min(Math.max(spots[0].x, EDGE), size.width - wide - EDGE);
    const tall = spots.reduce((sum, s) => sum + s.h + STACK_GAP, -STACK_GAP);
    let y = Math.min(spots[0].y, size.height - BOTTOM_BAR - tall);
    for (const s of spots) {
      s.x = x;
      s.y = y;
      y += s.h + STACK_GAP;
    }
  } else if (over > 0) {
    for (const s of spots) s.x -= over;
  }
  for (const s of spots) s.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
}

/** Lens shift: keeps the work centred in the part of the screen the header and bar leave clear. */
function shiftLens(camera, size, sx, sy) {
  const v = camera.view;
  if (!sx && !sy) {
    if (v?.enabled) camera.clearViewOffset();
    return;
  }
  const same = v?.enabled && v.fullWidth === size.width && v.fullHeight === size.height;
  if (same && Math.abs(v.offsetX - sx) < 0.25 && Math.abs(v.offsetY - sy) < 0.25) return;
  camera.setViewOffset(size.width, size.height, sx, sy, size.width, size.height);
}

/** Moves the camera along the path and keeps the DOM overlay in step. */
function syncFrame(store, camera, size, dt, flags) {
  const p = store.step(dt);
  const [sx, sy] = samplePath(p, tmpPos, tmpTarget, tmpShift);
  camera.position.copy(tmpPos);
  camera.lookAt(tmpTarget);
  camera.updateMatrixWorld();
  shiftLens(camera, size, sx, sy);

  // draw only the parts of the building that can be in view here
  for (const z of store.zones) {
    const shown = p >= z.range[0] && p <= z.range[1];
    if (shown !== z.shown) {
      z.shown = shown;
      for (const o of z.objects) o.visible = shown;
    }
  }

  // each work's wall label, while the camera arrives at the work and holds on it
  const spots = [];
  for (const w of WORKS) {
    const el = store.workEls.get(w.id);
    if (!el) continue;
    const [from, to] = LABEL_SHOWS[w.id];
    const corners = store.workFrames.get(w.id);
    const f = corners && p >= from && p <= to ? frameOnScreen(corners, camera, size) : null;
    // (shown only while most of the work is on screen)
    const show = Boolean(f) && f.seen > 0.6;
    if (show !== flags.works[w.id]) {
      flags.works[w.id] = show;
      el.setAttribute("data-visible", String(show));
    }
    if (show) spots.push(labelSpot(el, f, size));
  }
  placeLabels(spots, size);
  // the welcome fades as the walk begins, and is gone a few steps in
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

function Gallery({ onReady }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, withMeshopt);
  const lmBitmaps = useLoader(ImageBitmapLoader, LM_URLS, asBitmaps);
  const lmTextures = useMemo(() => lmBitmaps.map((bitmap) => new Texture(bitmap)), [lmBitmaps]);
  const envs = useLoader(HDRLoader, ENV_URLS);
  const figures = useLoader(GLTFLoader, EARLY_URLS, withMeshopt);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const root = useThree((s) => s.scene);

  const baked = useMemo(() => prepareGallery(gltf.scene, lmTextures, envs, gl), [gltf, lmTextures, envs, gl]);
  const vault = useMemo(() => (VAULT ? VaultFx.for(gltf.scene) : null), [gltf]);
  const store = useGallery();
  const [visitors, setVisitors] = useState(null);
  const [shown, setShown] = useState(false);
  const [live, setLive] = useState(false);
  const [others, setOthers] = useState(null);
  // the textures left for once the gallery is showing, nearest the first view first
  const laterTextures = useRef([]);
  // (the latest callback, read when preparation ends, so a new one never restarts it)
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  useFraming(gltf.scene, store);
  useFrame((_, dt) => vault?.update(store.smooth, dt));

  // Everything the first frames would otherwise do at once, done while the
  // poster is still up and spread over many frames so the page never freezes:
  // 1. every shader compiled in parallel, in the driver's own threads
  // 2. meanwhile, the textures of what the first view shows uploaded, a few
  //    milliseconds' worth per frame (the rest follow once the gallery is showing)
  // 3. every object drawn once, a few per frame (many GPU drivers finish a
  //    shader only at its first draw), off-screen ones and the vault's smoke too
  // Only then are the parts of the building out of view hidden and the poster faded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // (the intro's bar: the downloads fill its first half, this its second)
      store.setPrep(0.05);
      const people = stagePeople(EARLY, figures, envs);
      const parts = [gltf.scene, ...people.group];
      const all = new Group();
      all.add(...parts);
      const compiled = gl.compileAsync(all, camera, root);

      // what the first view shows, nearest first; one object per shader and
      // vertex layout (what the driver compiles for), from that view where it can be
      all.updateMatrixWorld(true);
      const view = firstView(store, camera);
      const drawables = [];
      for (const r of parts) {
        r.traverse((o) => {
          if (o.isMesh || o.isSprite) drawables.push({ o, visible: o.visible, culled: o.frustumCulled, ...seenFrom(o, view) });
        });
      }
      drawables.sort((x, y) => x.d - y.d);
      const firsts = new Map();
      for (const { o } of [...drawables.filter((x) => x.seen), ...drawables]) {
        const key = drawSignature(o);
        if (!firsts.has(key)) firsts.set(key, o);
      }
      const now = new Set();
      for (const { o, d, seen } of drawables) if (seen && d < FIRST_VIEW_REACH) texturesOfObject(o, now);
      for (const o of firsts.values()) texturesOfObject(o, now);
      const later = new Set();
      for (const { o } of drawables) if (o.isMesh) texturesOfObject(o, later);
      for (const t of now) later.delete(t);

      const textures = [...now];
      const uploads = textures.length;
      while (textures.length) {
        if (cancelled) return;
        const start = performance.now();
        do gl.initTexture(textures.pop());
        while (textures.length && performance.now() - start < UPLOAD_BUDGET);
        store.setPrep(0.05 + 0.7 * (1 - textures.length / uploads));
        await nextFrame();
      }
      await compiled;
      all.remove(...parts);
      if (cancelled) return;
      store.setPrep(0.8);

      // the first draws, a few per frame; everything else waits hidden until they all have been
      for (const { o } of drawables) {
        o.visible = false;
        o.frustumCulled = false;
      }
      setVisitors(people);
      setShown(true);
      await nextFrame();
      const order = [...firsts.values()];
      for (let i = 0; i < order.length; i += FIRST_DRAWS) {
        if (cancelled) return;
        for (const o of order.slice(i, i + FIRST_DRAWS)) o.visible = true;
        store.setPrep(0.8 + 0.2 * (i / order.length));
        await nextFrame();
      }
      for (const d of drawables) {
        d.o.visible = d.visible;
        d.o.frustumCulled = d.culled;
      }
      store.setZones(zonesOf(gltf.scene));
      await nextFrame();
      await nextFrame();
      if (cancelled) return;
      store.setPrep(1);
      laterTextures.current = [...later];
      setLive(true);
      onReadyRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [gl, camera, root, gltf, envs, figures, store]);

  // Once the gallery is showing, a few milliseconds per frame: the rest of the
  // rooms' textures, nearest the first view first, then the other visitors
  // (fetched meanwhile). They share the first visitor's shader, so coming into
  // view costs them nothing extra.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const upload = async (textures) => {
      while (textures.length && !cancelled) {
        await nextFrame();
        const start = performance.now();
        do gl.initTexture(textures.shift());
        while (textures.length && performance.now() - start < LIVE_UPLOAD_BUDGET);
      }
    };
    (async () => {
      const loader = withMeshopt(new GLTFLoader());
      const fetching = Promise.all(LATER_URLS.map((url) => loader.loadAsync(url)));
      await upload(laterTextures.current);
      const gltfs = await fetching;
      if (cancelled) return;
      const people = stagePeople(LATER, gltfs, envs);
      const all = new Group();
      all.add(...people.group);
      await gl.compileAsync(all, camera, root);
      all.remove(...people.group);
      await upload(people.group.flatMap(texturesOf));
      if (cancelled) return;
      setOthers(people);
    })();
    return () => {
      cancelled = true;
    };
  }, [live, gl, camera, root, envs]);

  return shown ? (
    <>
      <primitive object={gltf.scene} />
      {baked === 0 && <PreviewLights />}
      {visitors && <People staged={visitors} live={live} />}
      {others && <People staged={others} live />}
    </>
  ) : null;
}

/** Fits the camera path to the stage: closer to the design on wide screens, further back on narrow ones. */
function useFraming(scene, store) {
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  const gallery = useMemo(() => measureGallery(scene), [scene]);
  useEffect(() => store.setWorkFrames(gallery.faces), [gallery, store]);

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      const frameX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--frame-x")) || 16;
      // (the tallest wall label, and the gap between it and its work)
      const label = Math.max(0, ...[...store.workEls.values()].map((el) => el.offsetHeight)) + 12;
      const layout = {
        header: store.headerEl?.offsetHeight ?? 64,
        side: frameX + 8,
        bottomBar: 56,
        label,
      };
      const { fov, keys, shifts } = frame(gallery, size.width, size.height, layout);
      setFraming(keys, shifts);
      const { camera } = get();
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    };
    apply();
    // the header's and labels' heights settle once the web font arrives
    document.fonts?.ready.then(apply);
    return () => {
      cancelled = true;
    };
  }, [gallery, get, store, size.width, size.height]);
}

// Stand-in lighting used only while the model has not been baked yet.
const PREVIEW_LIGHTS = [
  [0.5, 3.0, -3.5], [5.0, 3.0, -4.5], [9.5, 3.0, -4.5], [13.5, 3.0, 0.1],
  [16.4, 3.0, 1.1], [19.5, 3.0, 1.5], [22.2, 3.0, 0.8], [24.9, 3.0, 1.7],
];
function PreviewLights() {
  return (
    <>
      <hemisphereLight args={["#fff1de", "#3a2e24", 0.9]} />
      {PREVIEW_LIGHTS.map((p) => (
        <pointLight key={p.join()} position={p} intensity={9} distance={11} decay={1.4} color="#ffd9b0" />
      ))}
    </>
  );
}

function CameraRig() {
  const store = useGallery();
  const flags = useRef({ bright: false, works: {}, away: -1 });
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
  // Starts at one canvas pixel per CSS pixel, which every GPU keeps smooth, and
  // sharpens to the screen's density (up to 1.5) once frames show the headroom;
  // it steps back down if they stop doing so.
  const [maxDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.5));
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1));
  const [live, setLive] = useState(false);

  return (
    <Canvas
      className={styles.canvas}
      dpr={dpr}
      camera={{ fov: FOV, near: 0.05, far: 80, position: [0, 1.6, 0] }}
      gl={GL}
    >
      {live && maxDpr > 1 && (
        <PerformanceMonitor
          // (step back below a steady 50 fps; sharpen only at a steady 59-60)
          bounds={(refresh) => (refresh > 100 ? [70, 100] : [50, 59])}
          flipflops={3}
          onIncline={() => setDpr(maxDpr)}
          onDecline={() => setDpr(1)}
          onFallback={() => setDpr(1)}
        />
      )}
      <Suspense fallback={null}>
        <Gallery
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
