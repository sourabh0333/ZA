"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import lightmaps from "./data/lightmaps.json";
// imported, not linked from public/: its URL carries a hash of the file, so a new
// capture (scene/tools/poster.mjs) can never be served from an old cache
import posterImage from "./poster.webp";
import { getStops, WALK } from "./path";
import { GalleryContext, GalleryStore } from "./store";
import Intro, { introSeen } from "./Intro";
import { SiteHeader, StageOverlay, Welcome } from "./Overlay";
import { useDotCursor, useWalk } from "./walk";
import styles from "./gallery.module.css";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

/** Starts the 3D downloads as soon as WebGL is known to work, before the scene's code has even loaded. */
function preloadGallery() {
  preload("/gallery/model/gallery.glb", { as: "fetch", crossOrigin: "anonymous" });
  for (const env of ["a", "b", "c"]) preload(`/gallery/env_${env}.pmrem.hdr`, { as: "fetch", crossOrigin: "anonymous" });
  // (fetched, as Scene.jsx decodes them off the main thread, so the preload is reused)
  for (const lm of Object.values(lightmaps)) preload(lm.file, { as: "fetch", crossOrigin: "anonymous" });
}

const noSubscribe = () => () => {};

function detectMode() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  try {
    return document.createElement("canvas").getContext("webgl2") ? "webgl" : "static";
  } catch {
    return "static";
  }
}

let cachedMode;
const getMode = () => (cachedMode ??= detectMode());
const getServerMode = () => "pending";

export default function GalleryHero({ children }) {
  const sectionRef = useRef(null);
  const [store] = useState(() => new GalleryStore());
  const mode = useSyncExternalStore(noSubscribe, getMode, getServerMode); // pending | webgl | static
  // (the opening only on the visit's first page: later ones show just the progress)
  const brief = useSyncExternalStore(noSubscribe, introSeen, () => false);
  const [ready, setReady] = useState(false);
  // the intro has lifted: from here the page scrolls (until then it would scroll past a still poster)
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);
  if (mode === "webgl") preloadGallery();
  const lenisRef = useWalk({ mode, store, sectionRef, enteredRef, getStops });

  useEffect(() => {
    enteredRef.current = entered;
    if (entered) lenisRef.current?.start();
  }, [entered, lenisRef]);

  useDotCursor({ mode, store, sectionRef });

  return (
    <GalleryContext.Provider value={store}>
      <SiteHeader />
      <section
        ref={sectionRef}
        className={styles.hero}
        data-mode={mode}
        aria-labelledby="gallery-title"
        style={{ "--walk": WALK }}
      >
        <div className={styles.stage}>
          <div className={styles.posterWrap} data-hidden={ready}>
            <Image
              className={styles.poster}
              src={posterImage}
              alt="The reception of Zigguratss: a pale stone desk under opal pendants before the gallery's backlit brass sign on fluted walnut."
              fill
              priority
              sizes="100vw"
            />
          </div>
          {mode === "webgl" && <Scene onReady={() => setReady(true)} />}
          {/* the lens vignette, over both the poster and the 3D view */}
          <div className={styles.vignette} aria-hidden="true" />
          <Welcome shown={entered || mode === "static"} />
          <StageOverlay />
          <div className={styles.srOnly}>{children}</div>
        </div>
      </section>
      {/* (rendered from the first paint, before WebGL is known to work; gone at once if it does not) */}
      {mode !== "static" && <Intro ready={ready} store={store} onEnter={() => setEntered(true)} brief={brief} />}
    </GalleryContext.Provider>
  );
}
