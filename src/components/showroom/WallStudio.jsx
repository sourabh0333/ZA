"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT, FRAMES, fromSearch, MOUNTS, PAINTS, toSearch, wallHex, wallName, WORKS } from "./studio";
import styles from "./showroom.module.css";

const WallScene = dynamic(() => import("./WallScene"), { ssr: false });

const noSubscribe = () => () => {};
const getSearch = () => window.location.search;
const getServerSearch = () => "";
// a fine pointer can drag the preview round a little (on touch, a drag scrolls the page)
const finePointer = () => window.matchMedia("(pointer: fine)").matches;
const SHAPES = [
  { id: "all", name: "All" },
  { id: "landscape", name: "Landscape" },
  { id: "portrait", name: "Portrait" },
  { id: "square", name: "Square" },
];

/**
 * "Design your wall", under the showroom: a live 3D preview of one of the
 * home's walls (WallScene.jsx) beside three steps, the wall's colour, the
 * work from the Zigguratss catalogue (hung at its real size) and its frame and
 * mount, and a summary. The design is kept in the page's address, so "Copy
 * link" shares exactly what is on screen.
 */
export default function WallStudio() {
  const search = useSyncExternalStore(noSubscribe, getSearch, getServerSearch);
  const rotate = useSyncExternalStore(noSubscribe, finePointer, () => false);
  const [chosen, setChosen] = useState(null);
  const design = chosen ?? fromSearch(search);
  const [shape, setShape] = useState("all");
  const [copied, setCopied] = useState(false);
  // the 3D preview starts only as the studio comes near the screen
  const [near, setNear] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "600px 0px" });
    io.observe(sectionRef.current);
    return () => io.disconnect();
  }, []);

  const set = (patch) => {
    // (from the address, which every change writes at once: quick clicks build on each other)
    const next = { ...fromSearch(window.location.search), ...patch };
    setChosen(next);
    setCopied(false);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${toSearch(next)}${window.location.hash}`);
  };

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}${toSearch(design)}#design`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link to your design", url);
    }
  };

  const work = WORKS.find((w) => w.id === design.art) ?? WORKS[0];
  const frame = FRAMES.find((f) => f.id === design.frame) ?? FRAMES[0];
  const mount = MOUNTS.find((m) => m.id === design.mount) ?? MOUNTS[0];
  const shown = WORKS.filter((w) => shape === "all" || w.shape === shape);
  const custom = design.wall.startsWith("#");

  return (
    <section id="design" ref={sectionRef} className={styles.studio} aria-labelledby="design-title">
      <div className={styles.studioHead}>
        <p className={styles.eyebrow}>Design your wall</p>
        <h2 id="design-title" className={styles.title}>
          Try a work on your wall.
        </h2>
        <p className={styles.body}>
          Choose a colour for the wall, a work from the collection and its frame: it hangs at its true size over a sideboard, so you
          can see how it will sit in a room.
        </p>
      </div>

      <div className={styles.studioGrid}>
        <div className={styles.preview} style={{ "--wall": wallHex(design.wall) }}>
          {near && <WallScene design={design} rotate={rotate} />}
          {rotate && <p className={styles.previewHint}>Drag to look from the side</p>}
        </div>

        <div className={styles.panel}>
          <fieldset className={styles.step}>
            <legend className={styles.stepLabel}>
              <span>01</span> Wall colour <em>{wallName(design.wall)}</em>
            </legend>
            <div className={styles.swatches}>
              {PAINTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.swatch}
                  style={{ "--swatch": p.hex }}
                  aria-pressed={design.wall === p.id}
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => set({ wall: p.id })}
                />
              ))}
              <label className={styles.swatchCustom} data-active={custom} title="Any colour">
                <input
                  type="color"
                  value={wallHex(design.wall)}
                  aria-label="Choose any wall colour"
                  onChange={(e) => set({ wall: e.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.step}>
            <legend className={styles.stepLabel}>
              <span>02</span> Artwork <em>{work.title}</em>
            </legend>
            <div className={styles.chips} role="group" aria-label="Show">
              {SHAPES.map((s) => (
                <button key={s.id} type="button" className={styles.chip} aria-pressed={shape === s.id} onClick={() => setShape(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
            {/* (the page's smooth scroll leaves this list to scroll by itself) */}
            <ul className={styles.works} data-lenis-prevent>
              {shown.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className={styles.workPick}
                    aria-pressed={design.art === w.id}
                    onClick={() => set({ art: w.id })}
                    title={`${w.title}, ${w.artist}`}
                  >
                    <Image src={w.image} alt={`${w.title}, by ${w.artist}`} fill sizes="90px" />
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className={styles.step}>
            <legend className={styles.stepLabel}>
              <span>03</span> Frame <em>{frame.name}</em>
            </legend>
            <div className={styles.frames}>
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={styles.framePick}
                  aria-pressed={design.frame === f.id}
                  onClick={() => set({ frame: f.id })}
                >
                  <span className={styles.frameIcon} data-frame={f.id} style={{ "--swatch": f.swatch }} aria-hidden="true" />
                  {f.name}
                </button>
              ))}
            </div>
            <div className={styles.chips} role="group" aria-label="Mount">
              <span className={styles.chipsLabel}>Mount</span>
              {MOUNTS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={design.mount === m.id}
                  disabled={design.frame === "none"}
                  onClick={() => set({ mount: m.id })}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles.summary}>
            <div className={styles.summaryImage} style={{ aspectRatio: String(work.aspect) }}>
              <Image src={work.image} alt="" fill sizes="80px" />
            </div>
            <div className={styles.summaryText}>
              <p className={styles.summaryTitle}>{work.title}</p>
              <p className={styles.summaryArtist}>{work.artist}</p>
              <p className={styles.summaryMeta}>
                {work.width} &times; {work.height} cm &middot; {work.medium}
              </p>
              <p className={styles.summaryMeta}>
                {frame.name}
                {design.frame !== "none" && mount.width > 0 ? `, ${mount.name.toLowerCase()} mount` : ""} &middot; {wallName(design.wall)} wall
              </p>
            </div>
            <div className={styles.summaryActions}>
              <button type="button" className={styles.action} onClick={copy}>
                {copied ? "Link copied" : "Copy link"}
              </button>
              <button type="button" className={styles.actionQuiet} onClick={() => set(DEFAULT)}>
                Start again
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
