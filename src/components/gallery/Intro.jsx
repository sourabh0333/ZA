"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useProgress } from "@react-three/drei";
import styles from "./gallery.module.css";

const NAME = "ZIGGURATSS";
const TIERS = 5; // the stepped emblem over the name, built bottom tier first
const BANDS = 7; // the screen leaves as bands that shrink away, top first
// Shown at least this long, so the name has finished arriving and a fast load never just flashes.
const MIN_SHOWN = 1500;
// If the 3D view never comes (a lost GPU, say), the intro lifts anyway onto the
// poster; long enough that a slow device's real load is never cut short.
const MAX_SHOWN = 30000;
// Once the view is live: full, "Welcome" and a glint across the name, this long, before the screen leaves.
const HOLD_READY = 450;
// the exit: the content fades, then the last band finishes shrinking
const EXIT_MS = 150 + (BANDS - 1) * 60 + 750;
// Between real steps the count creeps on (never more than this far ahead of
// them, nor to 100 before the view is live), so a long step never looks stuck.
const CREEP_AHEAD = 0.07;

/** What the gallery is doing, by how far along it is. */
function stage(ready, downloads, prep) {
  if (ready) return "Welcome";
  if (prep >= 0.85) return "Hanging the works";
  if (prep >= 0.25) return "Lighting the rooms";
  if (prep > 0) return "Building the materials";
  // (downloaded, the model and its images are being unpacked)
  if (downloads >= 0.9) return "Unpacking the rooms";
  return "Fetching the rooms";
}

/**
 * The opening screen, over everything while the 3D view downloads and prepares.
 * A stepped ziggurat, after the gallery's name, builds itself tier by tier and
 * the name rises in letter by letter from the middle out, between two drawn
 * hairlines. The name is set in outline and fills with gold from the bottom up
 * with the progress (half downloads, half the view's own preparation:
 * store.prep); once full, a glint crosses it. When the view is live the screen leaves
 * as bands that shrink away top first, so for a moment the dark left over is
 * itself a ziggurat, standing in the lit room; `onEnter` then lets the page scroll.
 */
/** The name, one masked letter per span, rising from the middle letters out. */
function letters() {
  return [...NAME].map((c, i) => (
    <span key={i} style={{ "--i": i, "--d": Math.abs(i - (NAME.length - 1) / 2) }}>
      <span>{c}</span>
    </span>
  ));
}

export default function Intro({ ready, store, onEnter }) {
  const { progress } = useProgress();
  // (in whole percents: the preparation moves every frame, the screen only when the count does)
  const prep = useSyncExternalStore(store.subscribePrep, () => Math.round(store.getPrep() * 100) / 100, () => 0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [shown, setShown] = useState(0);
  const downloads = progress / 100;
  const target = ready ? 1 : downloads * 0.5 + prep * 0.5;
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  const shownAt = useRef(0);
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onEnterRef.current = onEnter;
  });

  useEffect(() => {
    shownAt.current = performance.now();
    const giveUp = setTimeout(() => setLeaving(true), MAX_SHOWN);
    return () => clearTimeout(giveUp);
  }, []);

  useEffect(() => {
    const creep = setInterval(() => {
      const to = targetRef.current;
      // (never back: the loader's total grows as later files start, which can pull its share down)
      setShown((s) => (to >= 1 ? 1 : Math.max(s, to, Math.min(s + 0.003, to + CREEP_AHEAD, 0.99))));
    }, 120);
    return () => clearInterval(creep);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const wait = Math.max(HOLD_READY, MIN_SHOWN - (performance.now() - shownAt.current));
    const lift = setTimeout(() => setLeaving(true), wait);
    return () => clearTimeout(lift);
  }, [ready]);

  useEffect(() => {
    if (!leaving) return undefined;
    onEnterRef.current?.();
    const done = setTimeout(() => setGone(true), EXIT_MS + 50);
    return () => clearTimeout(done);
  }, [leaving]);

  if (gone) return null;
  const done = ready ? 1 : shown;
  return (
    <div className={styles.intro} data-leaving={leaving} data-ready={ready} role="status" aria-label={`Zigguratss: ${stage(ready, downloads, prep)}`}>
      {/* nothing scrolls under it, even before the page's scripts have run */}
      {!leaving && <style>{"html{overflow:hidden}"}</style>}
      <div className={styles.introBands} aria-hidden="true">
        {Array.from({ length: BANDS }, (_, i) => (
          <span key={i} style={{ "--i": i }} />
        ))}
      </div>
      <div className={styles.introGrain} aria-hidden="true" />

      <div className={styles.introContent} aria-hidden="true">
        <div className={styles.introTop}>
          <Image className={styles.introLogo} src="/brand/zigguratss-logo.png" width={208} height={208} alt="" priority />
          <span className={styles.introTopRight}>Scroll to walk through</span>
        </div>

        <div className={styles.introCenter}>
          <div className={styles.introZiggurat}>
            {Array.from({ length: TIERS }, (_, i) => (
              <span key={i} className={styles.introTier} style={{ "--i": i, "--w": `${100 - i * 19}%` }}>
                <span />
              </span>
            ))}
          </div>
          <div className={styles.introLockup}>
            <p className={styles.introRule}>
              <span>The art gallery</span>
            </p>
            <div className={styles.introName} style={{ "--p": done }}>
              <p className={styles.introNameLine}>{letters()}</p>
              {/* the gold, in a window that rises with the progress (a mask moved, never repainted) */}
              <span className={styles.introNameFill}>
                <p className={styles.introNameLine}>{letters()}</p>
              </span>
            </div>
            <p className={styles.introRule}>
              <span>Six rooms &middot; One walk</span>
            </p>
          </div>
        </div>

        <div className={styles.introFoot}>
          <span className={styles.introStage}>{stage(ready, downloads, prep)}</span>
          <span className={styles.introCount}>{String(Math.round(done * 100)).padStart(3, "0")}</span>
          <span className={styles.introTrack}>
            <span style={{ transform: `scaleX(${done})` }} />
          </span>
        </div>
      </div>
    </div>
  );
}
