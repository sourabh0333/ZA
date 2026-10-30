"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import Lenis from "lenis";
import lightmaps from "./data/lightmaps.json";
// imported, not linked from public/: its URL carries a hash of the file, so a new
// capture (scene/tools/poster.mjs) can never be served from an old cache
import posterImage from "./poster.webp";
import { WALK } from "./path";
import { GalleryContext, GalleryStore } from "./store";
import Intro from "./Intro";
import { SiteHeader, StageOverlay, Welcome } from "./Overlay";
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
  const [ready, setReady] = useState(false);
  // the intro has lifted: from here the page scrolls (until then it would scroll past a still poster)
  const [entered, setEntered] = useState(false);
  const lenisRef = useRef(null);
  const enteredRef = useRef(false);
  if (mode === "webgl") preloadGallery();

  // Scroll -> progress. Lenis smooths wheel input; the camera adds its own damping.
  useEffect(() => {
    if (mode !== "webgl") return undefined;
    const section = sectionRef.current;
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
    lenisRef.current = lenis;
    if (!enteredRef.current) lenis.stop();
    let frame = 0;
    const raf = (time) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    const measure = () => ({
      top: section.getBoundingClientRect().top + window.scrollY,
      span: section.offsetHeight - window.innerHeight,
    });
    const update = () => {
      const { top, span } = measure();
      // (a window with no height yet, such as a background tab, has no span: 0/0 would stick the camera)
      store.setTarget(span > 0 ? Math.min(1, Math.max(0, (window.scrollY - top) / span)) : 0);
    };
    lenis.on("scroll", update);
    window.addEventListener("resize", update);
    update();
    store.snap();
    store.setScroller((p) => {
      const { top, span } = measure();
      lenis.scrollTo(top + p * span, { duration: 2.4, easing: (t) => 1 - Math.pow(1 - t, 3) });
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.off("scroll", update);
      window.removeEventListener("resize", update);
      lenis.destroy();
      lenisRef.current = null;
      store.setScroller(null);
    };
  }, [mode, store]);

  useEffect(() => {
    enteredRef.current = entered;
    if (entered) lenisRef.current?.start();
  }, [entered]);

  // Dot cursor that trails the pointer (fine pointers only).
  useEffect(() => {
    if (mode !== "webgl" || !window.matchMedia("(pointer: fine)").matches) return undefined;
    const section = sectionRef.current;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let cx = x;
    let cy = y;
    let frame = 0;
    const move = (e) => {
      x = e.clientX;
      y = e.clientY;
      store.cursorEl?.setAttribute("data-active", String(Boolean(e.target.closest?.("a, button"))));
    };
    const tick = () => {
      cx += (x - cx) * 0.22;
      cy += (y - cy) * 0.22;
      store.cursorEl?.style.setProperty("transform", `translate3d(${cx}px, ${cy}px, 0)`);
      frame = requestAnimationFrame(tick);
    };
    section.addEventListener("pointermove", move);
    section.setAttribute("data-cursor", "dot");
    frame = requestAnimationFrame(tick);
    return () => {
      section.removeEventListener("pointermove", move);
      section.removeAttribute("data-cursor");
      cancelAnimationFrame(frame);
    };
  }, [mode, store]);

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
      {mode !== "static" && <Intro ready={ready} store={store} onEnter={() => setEntered(true)} />}
    </GalleryContext.Provider>
  );
}
