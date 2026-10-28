"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, BrightnessContrast, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  EquirectangularReflectionMapping,
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
import { BRIGHT_FROM, FOV, HOTSPOTS, LABELS, samplePath, setFraming, VAULT } from "./path";
import { useGallery } from "./store";
import { VaultFx } from "./vault";
import styles from "./gallery.module.css";

const MODEL_URL = "/gallery/model/gallery.glb";
const ENV_URLS = ["/gallery/env_a.hdr", "/gallery/env_b.hdr"];
const LM_NAMES = Object.keys(lightmaps);
const LM_URLS = LM_NAMES.map((n) => lightmaps[n].file);
const EXPOSURE = 1.0;
// Baked light already contains the room's indirect light, so the environment
// map is used for reflections only: drop its diffuse (irradiance) term.
const LIGHTS_FRAGMENT_MAPS = ShaderChunk.lights_fragment_maps.replace(
  "iblIrradiance += getIBLIrradiance( geometryNormal );",
  "",
);

function specularOnlyEnv(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", LIGHTS_FRAGMENT_MAPS);
  };
  material.customProgramCacheKey = () => "baked-lightmap";
}

/** Binds each mesh to its group's lightmap and reflection map; returns how many were baked. */
function prepareGallery(scene, lmTextures, [envA, envB], gl) {
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  envA.mapping = EquirectangularReflectionMapping;
  envB.mapping = EquirectangularReflectionMapping;
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
      mat.envMap = info.env === "b" ? envB : envA;
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
const tmpProj = new Vector3();
const tmpShift = [0, 0];

function placeAt(el, pos, camera, size) {
  tmpProj.set(pos[0], pos[1], pos[2]).project(camera);
  const x = ((tmpProj.x + 1) / 2) * size.width;
  const y = ((1 - tmpProj.y) / 2) * size.height;
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  return tmpProj.z < 1;
}

/** Lens shift: keeps the work centred in the part of the screen the caption leaves clear. */
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

  for (const h of HOTSPOTS) {
    const el = store.hotspotEls.get(h.id);
    if (!el) continue;
    const fade = Math.max(0, Math.min(1, Math.min(p - h.range[0], h.range[1] - p) / 0.03));
    const inFront = placeAt(el, h.pos, camera, size);
    const o = inFront ? fade : 0;
    el.style.opacity = String(o);
    el.style.pointerEvents = o > 0.5 ? "auto" : "none";
  }
  for (const l of LABELS) {
    const el = store.labelEls.get(l.id);
    if (!el) continue;
    // (the last caption's range runs past the end of the walk; its line fills at the end)
    const t = (p - l.range[0]) / (Math.min(1, l.range[1]) - l.range[0]);
    const show = p >= l.range[0] && p <= l.range[1];
    if (show !== flags.labels[l.id]) {
      flags.labels[l.id] = show;
      el.setAttribute("data-visible", String(show));
    }
    // the thin line along the caption's foot fills as the camera holds on the work
    if (show) el.style.setProperty("--hold", Math.min(1, t).toFixed(3));
  }
  const bright = p > BRIGHT_FROM;
  if (bright !== flags.bright && store.headerEl) {
    flags.bright = bright;
    store.headerEl.setAttribute("data-tab", String(bright));
  }
}

function Gallery({ onReady }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const lmTextures = useLoader(TextureLoader, LM_URLS);
  const envs = useLoader(HDRLoader, ENV_URLS);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  const baked = useMemo(() => prepareGallery(gltf.scene, lmTextures, envs, gl), [gltf, lmTextures, envs, gl]);
  const vault = useMemo(() => (VAULT ? VaultFx.for(gltf.scene) : null), [gltf]);
  const store = useGallery();
  useFraming(gltf.scene, store);
  useFrame((_, dt) => vault?.update(store.smooth, dt));

  useEffect(() => {
    // compile every shader program up front so the first scroll never hitches
    gl.compile(gltf.scene, camera);
  }, [gl, gltf, camera]);

  return (
    <>
      <primitive object={gltf.scene} />
      {baked === 0 && <PreviewLights />}
      <Ready onReady={onReady} />
    </>
  );
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
      const captions = new Map();
      for (const [id, el] of store.labelEls) {
        captions.set(id, { top: el.offsetTop, right: el.offsetLeft + el.offsetWidth });
      }
      const layout = {
        header: store.headerEl?.offsetHeight ?? 64,
        side: frameX + 8,
        bottomBar: 56,
        captions,
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
    // caption heights change once the web font arrives
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

function Ready({ onReady }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 3) onReady?.();
  });
  return null;
}

function CameraRig() {
  const store = useGallery();
  const flags = useRef({ bright: false, labels: {} });
  useFrame((state, dt) => syncFrame(store, state.camera, state.size, dt, flags.current));
  return null;
}

export default function Scene({ onReady }) {
  const [maxDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.5));
  const [dpr, setDpr] = useState(maxDpr);

  return (
    <Canvas
      className={styles.canvas}
      flat
      dpr={dpr}
      camera={{ fov: FOV, near: 0.05, far: 80, position: [0, 1.6, 0] }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} />
      <Suspense fallback={null}>
        <Gallery onReady={onReady} />
        <CameraRig />
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.55} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.AGX} />
          {/* matches Blender's "AgX - Medium High Contrast" look used for the renders */}
          <BrightnessContrast brightness={-0.02} contrast={0.16} />
          <Vignette offset={0.28} darkness={0.5} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
