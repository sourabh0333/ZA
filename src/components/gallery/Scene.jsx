"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  AgXToneMapping,
  CubeUVReflectionMapping,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  ShaderChunk,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import lightmaps from "./data/lightmaps.json";
import { frame, measureGallery } from "./framing";
import { BRIGHT_FROM, FOV, samplePath, setFraming, VAULT, WORKS, ZONES } from "./path";
import People, { DOWNSTAIRS, DOWNSTAIRS_URLS, ROOFTOP, ROOFTOP_URLS, stagePeople } from "./People";
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
useLoader.preload(TextureLoader, LM_URLS);
useLoader.preload(HDRLoader, ENV_URLS);
useLoader.preload(GLTFLoader, DOWNSTAIRS_URLS, withMeshopt);

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const UPLOAD_BUDGET = 14; // ms of texture uploads per frame while the poster is up
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


/** Every texture the gallery's materials use (not render targets: those live on the GPU already). */
function texturesOf(root) {
  const found = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const v of Object.values(o.material)) if (v?.isTexture && !v.isRenderTargetTexture) found.add(v);
  });
  return [...found];
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
const EDGE = 16; // px the details card keeps from the screen's edges

/** Puts an element's centre on a point in the scene; false when the point is behind the camera. */
function placeAt(el, pos, camera, size) {
  tmpProj.set(pos[0], pos[1], pos[2]).project(camera);
  const x = ((tmpProj.x + 1) / 2) * size.width;
  const y = ((1 - tmpProj.y) / 2) * size.height;
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  return tmpProj.z < 1;
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

  // each work's eye, on the work's top-right corner while the work is in view
  for (const w of WORKS) {
    const el = store.workEls.get(w.id);
    if (!el) continue;
    // (away from its stretch of the walk an eye is hidden and needs no placing)
    if (!(p >= w.range[0] && p <= w.range[1])) {
      if (flags.works[w.id]) {
        flags.works[w.id] = false;
        el.setAttribute("data-visible", "false");
      }
      continue;
    }
    const inFront = placeAt(el, w.pos, camera, size);
    const onScreen = Math.abs(tmpProj.x) < 0.94 && Math.abs(tmpProj.y) < 0.9;
    const show = inFront && onScreen;
    if (show !== flags.works[w.id]) {
      flags.works[w.id] = show;
      el.setAttribute("data-visible", String(show));
    }
    // open the details outward, onto the wall; on the other side if that runs off
    // the screen; below the eye, kept on screen, if neither side has room (phones)
    if (show) {
      const x = ((tmpProj.x + 1) / 2) * size.width;
      const cardW = el.lastChild.offsetWidth + 12;
      const side = x + cardW + EDGE <= size.width ? "right" : x - cardW >= EDGE ? "left" : "below";
      if (side !== flags.sides[w.id]) {
        flags.sides[w.id] = side;
        el.setAttribute("data-side", side);
      }
      if (side === "below") {
        const left = Math.min(Math.max(x - cardW / 2, EDGE), size.width - cardW - EDGE);
        el.style.setProperty("--card-x", `${(left - x + el.offsetWidth / 2).toFixed(1)}px`);
      }
    }
  }
  const bright = p > BRIGHT_FROM;
  if (bright !== flags.bright && store.headerEl) {
    flags.bright = bright;
    store.headerEl.setAttribute("data-tab", String(bright));
  }
}

function Gallery({ onReady }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, withMeshopt);
  const lmTextures = useLoader(TextureLoader, LM_URLS);
  const envs = useLoader(HDRLoader, ENV_URLS);
  const figures = useLoader(GLTFLoader, DOWNSTAIRS_URLS, withMeshopt);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const root = useThree((s) => s.scene);

  const baked = useMemo(() => prepareGallery(gltf.scene, lmTextures, envs, gl), [gltf, lmTextures, envs, gl]);
  const vault = useMemo(() => (VAULT ? VaultFx.for(gltf.scene) : null), [gltf]);
  const store = useGallery();
  const [visitors, setVisitors] = useState(null);
  const [shown, setShown] = useState(false);
  const [live, setLive] = useState(false);
  const [rooftop, setRooftop] = useState(null);
  // (the latest callback, read when preparation ends, so a new one never restarts it)
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  useFraming(gltf.scene, store);
  useFrame((_, dt) => vault?.update(store.smooth, dt));

  // Everything the first frames would otherwise do at once, done while the
  // poster is still up and spread over many frames so the page never freezes:
  // 1. every shader compiled in parallel, off the main thread
  // 2. every texture uploaded, a few milliseconds' worth per frame
  // 3. every object drawn once, a few per frame (many GPU drivers finish a
  //    shader only at its first draw), off-screen ones and the vault's smoke too
  // Only then are the parts of the building out of view hidden and the poster faded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const people = stagePeople(DOWNSTAIRS, figures, envs);
      const all = new Group();
      all.add(gltf.scene, ...people.group);
      await gl.compileAsync(all, camera, root);
      all.remove(gltf.scene, ...people.group);
      if (cancelled) return;
      const textures = texturesOf(gltf.scene).concat(people.group.flatMap(texturesOf));
      while (textures.length) {
        if (cancelled) return;
        const start = performance.now();
        do gl.initTexture(textures.pop());
        while (textures.length && performance.now() - start < UPLOAD_BUDGET);
        await nextFrame();
      }
      // one object per shader and vertex layout (what the driver compiles for)
      // is drawn once, whether in view or not, a few per frame; everything else
      // waits hidden until they all have been
      const firsts = new Map();
      const drawables = [];
      for (const r of [gltf.scene, ...people.group]) {
        r.traverse((o) => {
          if (!(o.isMesh || o.isSprite)) return;
          drawables.push({ o, visible: o.visible, culled: o.frustumCulled });
          const key = drawSignature(o);
          if (!firsts.has(key)) firsts.set(key, o);
          o.visible = false;
          o.frustumCulled = false;
        });
      }
      setVisitors(people);
      setShown(true);
      await nextFrame();
      const order = [...firsts.values()];
      for (let i = 0; i < order.length; i += FIRST_DRAWS) {
        if (cancelled) return;
        for (const o of order.slice(i, i + FIRST_DRAWS)) o.visible = true;
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
      setLive(true);
      onReadyRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [gl, camera, root, gltf, envs, figures, store]);

  // The rooftop's visitors, once the gallery is showing: fetched, compiled and
  // uploaded a few milliseconds per frame. They share the shaders of the
  // visitors below, so the first time they come into view costs nothing extra.
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    (async () => {
      const loader = withMeshopt(new GLTFLoader());
      const gltfs = await Promise.all(ROOFTOP_URLS.map((url) => loader.loadAsync(url)));
      if (cancelled) return;
      const people = stagePeople(ROOFTOP, gltfs, envs);
      const all = new Group();
      all.add(...people.group);
      await gl.compileAsync(all, camera, root);
      all.remove(...people.group);
      const textures = people.group.flatMap(texturesOf);
      while (textures.length) {
        await nextFrame();
        if (cancelled) return;
        const start = performance.now();
        do gl.initTexture(textures.pop());
        while (textures.length && performance.now() - start < UPLOAD_BUDGET / 2);
      }
      setRooftop(people);
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
      {rooftop && <People staged={rooftop} live />}
    </>
  ) : null;
}

/** Fits the camera path to the stage: closer to the design on wide screens, further back on narrow ones. */
function useFraming(scene, store) {
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  const gallery = useMemo(() => measureGallery(scene), [scene]);

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      const frameX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--frame-x")) || 16;
      const layout = {
        header: store.headerEl?.offsetHeight ?? 64,
        side: frameX + 8,
        bottomBar: 56,
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
    // the header's height settles once the web font arrives
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
  const flags = useRef({ bright: false, works: {}, sides: {} });
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
