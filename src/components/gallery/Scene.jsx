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
import { BRIGHT_FROM, FOV, samplePath, setFraming, VAULT, WORKS } from "./path";
import People from "./People";
import { useGallery } from "./store";
import { VaultFx } from "./vault";
import styles from "./gallery.module.css";

const MODEL_URL = "/gallery/model/gallery.glb";
const ENV_URLS = ["/gallery/env_a.hdr", "/gallery/env_b.hdr", "/gallery/env_c.hdr"]; // dark gallery, frame B, rooftop
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
function prepareGallery(scene, lmTextures, envs, gl) {
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  for (const env of envs) env.mapping = EquirectangularReflectionMapping;
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

  // each work's eye, on the work's top-right corner while the work is in view
  for (const w of WORKS) {
    const el = store.workEls.get(w.id);
    if (!el) continue;
    const inFront = placeAt(el, w.pos, camera, size);
    const onScreen = Math.abs(tmpProj.x) < 0.94 && Math.abs(tmpProj.y) < 0.9;
    const show = p >= w.range[0] && p <= w.range[1] && inFront && onScreen;
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
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const lmTextures = useLoader(TextureLoader, LM_URLS);
  const envs = useLoader(HDRLoader, ENV_URLS);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  const baked = useMemo(() => prepareGallery(gltf.scene, lmTextures, envs, gl), [gltf, lmTextures, envs, gl]);
  const vault = useMemo(() => (VAULT ? VaultFx.for(gltf.scene) : null), [gltf]);
  const store = useGallery();
  const [visitors, setVisitors] = useState(false);
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
      <Ready
        onReady={() => {
          onReady?.();
          setVisitors(true);
        }}
      />
      {visitors && (
        <Suspense fallback={null}>
          <People envs={envs} />
        </Suspense>
      )}
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
  const flags = useRef({ bright: false, works: {}, sides: {} });
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
