"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Lenis from "lenis";
import { useProgress } from "@react-three/drei";
import { GalleryContext, GalleryStore } from "./store";
import { SiteHeader, StageOverlay } from "./Overlay";
import styles from "./gallery.module.css";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

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

function Loader({ hidden }) {
  const { progress } = useProgress();
  return (
    <div className={styles.loader} data-hidden={hidden} aria-hidden="true">
      <span className={styles.loaderBar} style={{ transform: `scaleX(${progress / 100})` }} />
    </div>
  );
}

export default function GalleryHero({ children }) {
  const sectionRef = useRef(null);
  const [store] = useState(() => new GalleryStore());
  const mode = useSyncExternalStore(noSubscribe, getMode, getServerMode); // pending | webgl | static
  const [ready, setReady] = useState(false);

  // Scroll -> progress. Lenis smooths wheel input; the camera adds its own damping.
  useEffect(() => {
    if (mode !== "webgl") return undefined;
    const section = sectionRef.current;
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
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
      store.setTarget(Math.min(1, Math.max(0, (window.scrollY - top) / span)));
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
      store.setScroller(null);
    };
  }, [mode, store]);

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
      <section ref={sectionRef} className={styles.hero} data-mode={mode} aria-labelledby="gallery-title">
        <div className={styles.stage}>
          <div className={styles.posterWrap} data-hidden={ready}>
            <Image
              className={styles.poster}
              src="/gallery/poster.webp"
              alt="The material library of ZA Gallery: shelves of samples, brass spotlights and a long oak table."
              fill
              priority
              sizes="100vw"
            />
          </div>
          {mode === "webgl" && <Scene onReady={() => setReady(true)} />}
          {mode === "webgl" && <Loader hidden={ready} />}
          <StageOverlay />
          <div className={styles.srOnly}>{children}</div>
        </div>
      </section>
    </GalleryContext.Provider>
  );
}
