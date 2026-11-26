"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  AgXToneMapping,
  Group,
  MathUtils,
  Matrix4,
  Object3D,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import "./grade";
import { MODEL_URL, withMeshopt } from "./Scene";
import { FRAMES, MOUNTS, WORKS, wallHex } from "./studio";

// The studio's preview: one wall of the home, the living room's south wall
// with its walnut sideboard, books, vase, lamp and a plant (taken from the
// showroom's model, so nothing more downloads), painted the chosen colour,
// the chosen work hung over the sideboard at its real size in the chosen
// frame, lit by a ceiling spot. Drawn only when something changes.
// Three.js axes as in the showroom: x east, y up, the wall's face at z -5.06,
// the room toward -z.
const WALL_Z = -5.06;
const ART_X = 1.75; // over the sideboard's middle
const SIDEBOARD_TOP = 0.68;
const CEILING = 2.9;
const EYE = [ART_X, 1.5, WALL_Z - 4.4];
const LOOK = [ART_X, 1.35, WALL_Z];
// the pieces of the living room brought in as they stand there; the plant moved up beside the sideboard
const KEEP = /^(Floor|Sideboard0_|SideboardVase0_|SideboardBooks0_|FloorLamp)/;
const PLANT = /^BigPlant0_/;
const PLANT_SHIFT = new Matrix4().makeTranslation(-3.0, 0, 6.0);
const FRAME_FINISH = {
  black: { color: "#141312", roughness: 0.45, metalness: 0 },
  walnut: { color: "#4e3424", roughness: 0.55, metalness: 0 },
  oak: { color: "#b08a5e", roughness: 0.6, metalness: 0 },
  white: { color: "#eeece6", roughness: 0.5, metalness: 0 },
  gold: { color: "#c9a45c", roughness: 0.28, metalness: 1 },
};
const MOUNT_CARD = "#f3f0e8";

// each work's image, loaded once however often it is chosen
const textures = new Map();
function loadTexture(url) {
  if (!textures.has(url)) {
    textures.set(
      url,
      new TextureLoader().loadAsync(url).then((t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      }),
    );
  }
  return textures.get(url);
}

/** The living room's furniture and floor, cloned from the showroom's model where they stand. */
function Furniture() {
  const gltf = useLoader(GLTFLoader, MODEL_URL, withMeshopt);
  const group = useMemo(() => {
    const g = new Group();
    gltf.scene.updateMatrixWorld(true);
    const take = (o, shift) => {
      const c = o.clone();
      c.matrixAutoUpdate = false;
      c.matrix.copy(o.matrixWorld);
      if (shift) c.matrix.premultiply(shift);
      c.traverse((m) => {
        m.castShadow = o.name !== "Floor";
        m.receiveShadow = true;
      });
      g.add(c);
    };
    const walk = (o) => {
      if (KEEP.test(o.name)) take(o);
      else if (PLANT.test(o.name)) take(o, PLANT_SHIFT);
      else o.children.forEach(walk);
    };
    walk(gltf.scene);
    return g;
  }, [gltf]);
  return <primitive object={group} />;
}

/** The wall behind, the corner wall to its left, the ceiling, skirting: all in the chosen paint. */
function Room({ hex }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, withMeshopt);
  // (the plaster's own relief, tiled at about a metre and a half)
  const relief = useMemo(() => {
    let found = null;
    gltf.scene.traverse((o) => {
      if (!found && o.isMesh && o.material.name === "sr_wall" && o.material.normalMap) found = o.material.normalMap;
    });
    if (!found) return null;
    const t = found.clone();
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(5, 2);
    t.needsUpdate = true;
    return t;
  }, [gltf]);
  const paint = { color: hex, roughness: 0.92, normalMap: relief, normalScale: new Vector2(0.25, 0.25) };
  return (
    <>
      <mesh position={[4, CEILING / 2, WALL_Z]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[8, CEILING]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[0, CEILING / 2, WALL_Z - 3.5]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[7, CEILING]} />
        <meshStandardMaterial {...paint} />
      </mesh>
      <mesh position={[4, CEILING, WALL_Z - 3.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 7]} />
        <meshStandardMaterial color="#e9e6e0" roughness={0.95} />
      </mesh>
      <mesh position={[4, 0.045, WALL_Z - 0.012]} receiveShadow>
        <boxGeometry args={[8, 0.09, 0.024]} />
        <meshStandardMaterial color="#e6e3dc" roughness={0.4} />
      </mesh>
      <mesh position={[0.012, 0.045, WALL_Z - 3.5]} receiveShadow>
        <boxGeometry args={[0.024, 0.09, 7]} />
        <meshStandardMaterial color="#e6e3dc" roughness={0.4} />
      </mesh>
    </>
  );
}

/**
 * A work's sizes in metres in its frame and mount, and where it hangs: its
 * foot a hand's width over the sideboard (centred at 1.55 m at least), never
 * into the ceiling.
 */
function hang(work, frame, mount) {
  const f = FRAMES.find((x) => x.id === frame) ?? FRAMES[0];
  const m = f.id === "none" ? 0 : (MOUNTS.find((x) => x.id === mount) ?? MOUNTS[0]).width;
  const w = work.width / 100;
  const h = work.height / 100;
  const outerW = w + 2 * (m + f.width);
  const outerH = h + 2 * (m + f.width);
  const y = Math.min(Math.max(1.55, SIDEBOARD_TOP + 0.22 + outerH / 2), CEILING - 0.14 - outerH / 2);
  return { f, m, w, h, outerW, outerH, y };
}

/** The work at its real size, in its frame (or bare, wrapped round its stretcher), with its mount. */
function Artwork({ work, size }) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadTexture(work.image).then((t) => {
      if (!cancelled) setTexture(t);
    });
    return () => {
      cancelled = true;
    };
  }, [work.image]);

  const { f, m, w, h, outerW, outerH, y } = size;
  const bare = f.id === "none";
  const d = f.depth;
  const finish = FRAME_FINISH[f.id];

  return (
    <group position={[ART_X, y, WALL_Z]}>
      {bare ? (
        // the canvas: its wrapped edges a shade darker, the image on its face
        <>
          <mesh position={[0, 0, -d / 2]} castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#3d3832" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, -d - 0.001]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[w, h]} />
            {/* (a new material once the image is in: a map added later needs its shader rebuilt) */}
            <meshStandardMaterial key={texture?.uuid ?? "none"} map={texture} color={texture ? "#ffffff" : "#8a8278"} roughness={0.85} />
          </mesh>
        </>
      ) : (
        <>
          {/* the frame's four sides, wall to face */}
          {[
            [[outerW, f.width, d], [0, outerH / 2 - f.width / 2, -d / 2]],
            [[outerW, f.width, d], [0, -outerH / 2 + f.width / 2, -d / 2]],
            [[f.width, outerH - 2 * f.width, d], [outerW / 2 - f.width / 2, 0, -d / 2]],
            [[f.width, outerH - 2 * f.width, d], [-outerW / 2 + f.width / 2, 0, -d / 2]],
          ].map(([size, at], i) => (
            <mesh key={i} position={at} castShadow>
              <boxGeometry args={size} />
              <meshStandardMaterial {...finish} />
            </mesh>
          ))}
          {/* the mount (or a dark backing where there is none), then the work set into it */}
          <mesh position={[0, 0, -d * 0.35]} rotation={[0, Math.PI, 0]} receiveShadow>
            <planeGeometry args={[w + 2 * m, h + 2 * m]} />
            <meshStandardMaterial color={m > 0 ? MOUNT_CARD : "#1c1a18"} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0, -d * 0.35 - 0.002]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[w, h]} />
            <meshStandardMaterial key={texture?.uuid ?? "none"} map={texture} color={texture ? "#ffffff" : "#8a8278"} roughness={0.85} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** A ceiling spot on the work (it follows the work's height), a soft fill, and reflections for the gold. */
function Lights({ artY }) {
  const [target] = useState(() => new Object3D());
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [get]);
  return (
    <>
      <hemisphereLight args={["#fff6ea", "#5a4a3a", 0.7]} />
      <pointLight position={[ART_X - 1.5, 2.6, WALL_Z - 2.6]} intensity={4} distance={9} decay={1.3} color="#ffe2c2" />
      <pointLight position={[ART_X + 2.6, 2.6, WALL_Z - 3.2]} intensity={3} distance={9} decay={1.3} color="#ffe2c2" />
      <primitive object={target} position={[ART_X, artY, WALL_Z]} />
      <spotLight
        position={[ART_X, CEILING - 0.05, WALL_Z - 1.1]}
        target={target}
        angle={0.62}
        penumbra={0.7}
        intensity={18}
        decay={1.6}
        distance={8}
        color="#fff0dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/** Aims the camera at the wall, widening the lens on narrow previews so the whole sideboard stays in view. */
function Aim() {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const { camera, invalidate } = get();
    const aspect = size.width / size.height;
    const half = Math.atan(2.1 / 4.4); // 2.1 m either side of the work, from 4.4 m back
    camera.fov = MathUtils.clamp(MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / aspect)), 36, 64);
    camera.position.set(...EYE);
    camera.lookAt(...LOOK);
    camera.updateProjectionMatrix();
    invalidate();
  }, [get, size.width, size.height]);
  return null;
}

const GL = { antialias: true, toneMapping: AgXToneMapping, powerPreference: "high-performance" };

export default function WallScene({ design, rotate }) {
  const work = WORKS.find((w) => w.id === design.art) ?? WORKS[0];
  const size = hang(work, design.frame, design.mount);
  return (
    // (a finger on the preview still scrolls the page)
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.75]}
      gl={GL}
      camera={{ fov: 40, near: 0.05, far: 40, position: EYE }}
      style={{ touchAction: rotate ? "none" : "pan-y" }}
    >
      <color attach="background" args={["#1b1815"]} />
      <Aim />
      <Lights artY={size.y} />
      <Suspense fallback={null}>
        <Room hex={wallHex(design.wall)} />
        <Furniture />
      </Suspense>
      <Artwork work={work} size={size} />
      {rotate && (
        // a gentle look round from either side; the page's own scroll is left to the wheel
        <OrbitControls
          target={LOOK}
          enableZoom={false}
          enablePan={false}
          minAzimuthAngle={Math.PI - 0.38}
          maxAzimuthAngle={Math.PI + 0.38}
          minPolarAngle={Math.PI / 2 - 0.12}
          maxPolarAngle={Math.PI / 2 + 0.08}
          rotateSpeed={0.5}
        />
      )}
    </Canvas>
  );
}
