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
import { getStops, WALK } from "./path";
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

// A swipe shorter than this (px) is a tap or a wobble, not a step.
const SWIPE = 36;
// After a touch, the scroll counts as settled once it has been still this long (ms).
const SETTLE = 160;

/** Seconds to travel between two stops: short hops are quick, the stairs take longer. */
const travelTime = (from, to) => Math.min(2.2, 0.9 + Math.abs(to - from) * 9);

/** Which of the stops is nearest to progress p. */
const nearestStop = (stops, p) => stops.reduce((best, s, i) => (Math.abs(s - p) < Math.abs(stops[best] - p) ? i : best), 0);

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
      goal = -1; // (a swipe after this steps on from where the Rooms menu lands)
      lenis.scrollTo(top + p * span, { duration: 2.4, easing: (t) => 1 - Math.pow(1 - t, 3) });
    });

    // Touch screens: one swipe, one stop. A flick of native momentum scroll
    // carried the walk past several works (they sit less than half a screen of
    // scroll apart) and came to rest between them, half turned to a wall; so
    // while the gallery fills the screen a swipe up or down travels to the next
    // or previous stop and settles exactly on it, and a scroll that drifts in
    // from the page below settles on the nearest. Wheels and trackpads keep
    // Lenis's smooth scroll.
    let swipe = null; // where the touch began, if it is ours
    let goal = -1; // the stop being travelled to
    let touched = false; // the last scroll came from a touch screen
    let settle = 0;
    const progress = () => {
      const { top, span } = measure();
      return span > 0 ? (window.scrollY - top) / span : 0;
    };
    // (the gallery fills the screen from its first stop to its last)
    const inside = () => {
      const p = progress();
      return p > -0.001 && p < 1.001;
    };
    const travel = (to) => {
      const { top, span } = measure();
      const stops = getStops();
      const from = progress();
      goal = to;
      const done = () => {
        goal = -1;
      };
      if (to >= stops.length) {
        // past the last stop: on down the page, to what follows the gallery
        lenis.scrollTo(top + section.offsetHeight, { duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 3), onComplete: done });
        return;
      }
      lenis.scrollTo(top + stops[Math.max(0, to)] * span, {
        duration: travelTime(from, stops[Math.max(0, to)]),
        easing: (t) => 1 - Math.pow(1 - t, 3),
        onComplete: done,
      });
    };
    /** One stop on (dir 1) or back (-1): from where a step is already heading, else from here. */
    const step = (dir) => {
      if (goal >= 0) {
        travel(Math.max(0, goal + dir));
        return;
      }
      // (between two stops, the next one ahead or behind, never past it)
      const stops = getStops();
      const p = progress();
      const ahead = stops.findIndex((s) => s > p + 1e-4);
      const i = dir > 0 ? (ahead < 0 ? stops.length : ahead) : (ahead < 0 ? stops.length : ahead) - 1;
      const at = stops.findIndex((s) => Math.abs(s - p) <= 1e-4);
      travel(Math.max(0, at >= 0 ? at + dir : i));
    };
    // The arrow keys: right on to the next work, left back to the previous one
    // (up and down still scroll the page as they always do)
    const onKey = (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !enteredRef.current) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const p = progress();
      const below = p >= 1.001 && p <= section.offsetHeight / measure().span;
      if (!inside() && !(below && e.key === "ArrowLeft")) return;
      e.preventDefault();
      touched = false;
      step(e.key === "ArrowRight" ? 1 : -1);
    };
    const onTouchStart = (e) => {
      touched = true;
      swipe = enteredRef.current && e.touches.length === 1 && inside() ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const onTouchMove = (e) => {
      // (the page itself does not move: the swipe's end decides where it goes)
      if (swipe && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e) => {
      if (!swipe) return;
      const t = e.changedTouches[0];
      // up or left across the screen: on along the walk; down or right: back
      const on = Math.abs(t.clientX - swipe.x) > Math.abs(t.clientY - swipe.y) ? swipe.x - t.clientX : swipe.y - t.clientY;
      swipe = null;
      if (Math.abs(on) < SWIPE) return;
      // (swipes in quick succession step on from where the last one is heading)
      step(Math.sign(on));
    };
    const onScroll = () => {
      clearTimeout(settle);
      if (!touched || goal >= 0) return;
      settle = setTimeout(() => {
        if (goal >= 0 || swipe || !enteredRef.current || !inside()) return;
        const { span } = measure();
        const stops = getStops();
        const i = nearestStop(stops, progress());
        if (Math.abs(stops[i] - progress()) * span > 2) travel(i);
      }, SETTLE);
    };
    const onWheel = () => {
      touched = false;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
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
