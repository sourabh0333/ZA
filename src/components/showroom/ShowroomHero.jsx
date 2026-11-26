"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import { GalleryContext } from "../gallery/store";
import Intro, { introSeen } from "../gallery/Intro";
import { SiteHeader, Welcome } from "../gallery/Overlay";
import { useDotCursor, useWalk } from "../gallery/walk";
import { getStops, WALK } from "./path";
import { ShowroomStore } from "./store";
import { ShowroomOverlay, ShowroomWorks } from "./Overlay";
import WallStudio from "./WallStudio";
import gallery from "../gallery/gallery.module.css";
import styles from "./showroom.module.css";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

/** Starts the model's and the garden view's downloads as soon as WebGL is known to work, before the scene's code has even loaded. */
function preloadShowroom() {
  preload("/showroom/model/showroom.glb", { as: "fetch", crossOrigin: "anonymous" });
  preload("/showroom/sky.webp", { as: "image" });
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

/**
 * The products page's hero: a walk through a home in six rooms, a work from
 * the Zigguratss catalogue on show in each, scrolled through like the
 * gallery on the home page. Each work's eye icon opens its details.
 */
export default function ShowroomHero({ children }) {
  const sectionRef = useRef(null);
  const [store] = useState(() => new ShowroomStore());
  const mode = useSyncExternalStore(noSubscribe, getMode, getServerMode); // pending | webgl | static
  // (the opening only on the visit's first page: later ones show just the progress)
  const brief = useSyncExternalStore(noSubscribe, introSeen, () => false);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);
  if (mode === "webgl") preloadShowroom();
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
        id="showroom"
        className={gallery.hero}
        data-mode={mode}
        aria-labelledby="showroom-title"
        style={{ "--walk": WALK }}
      >
        <div className={gallery.stage}>
          <div className={`${gallery.posterWrap} ${styles.posterBlank}`} data-hidden={ready} />
          {mode === "webgl" && <Scene onReady={() => setReady(true)} />}
          <div className={gallery.vignette} aria-hidden="true" />
          <Welcome
            shown={entered || mode === "static"}
            rule={"Zigguratss · The Showroom"}
            title="Art for Every Room"
            invite="to walk through a home, an original work in every room"
          />
          {mode === "webgl" && <ShowroomOverlay />}
          <div className={gallery.srOnly}>{children}</div>
        </div>
      </section>
      <WallStudio />
      <ShowroomWorks />
      {mode !== "static" && (
        <Intro
          ready={ready}
          store={store}
          onEnter={() => setEntered(true)}
          brief={brief}
          kicker="The showroom"
          tagline={"Six rooms · Original art"}
        />
      )}
    </GalleryContext.Provider>
  );
}
