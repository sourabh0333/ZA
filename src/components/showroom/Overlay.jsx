"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGallery } from "../gallery/store";
import { EyeIcon, ExpandIcon, PlanIcon } from "../gallery/icons";
import { PRODUCTS, ROOMS } from "./path";
import gallery from "../gallery/gallery.module.css";
import styles from "./showroom.module.css";

const noSubscribe = () => () => {};
// iPhone Safari (and some in-app browsers) cannot take a page fullscreen
const canFullscreen = () => Boolean(document.fullscreenEnabled);

/** A work's details, as on its card and in the list under the hero. */
export function meta(w) {
  return [w.medium, w.size].filter(Boolean).join(" · ");
}

/**
 * Under the hero: every work on show in the showroom. "See it in the room"
 * walks back to the work and opens its card once there.
 */
export function ShowroomWorks() {
  const store = useGallery();
  const visit = (w) => {
    store.scrollTo(w.at);
    // (the walk there takes 2.4 s: walk.js)
    setTimeout(() => store.setOpen(w.id), 2600);
  };
  return (
    <section id="works" className={styles.section} aria-labelledby="works-title">
      <p className={styles.eyebrow}>In the showroom</p>
      <h2 id="works-title" className={styles.title}>
        {PRODUCTS.length} works, at home in every room.
      </h2>
      <p className={styles.body}>
        Every work along the walk is from the Zigguratss collection, hung where it might live with you. Choose one to walk back to
        it.
      </p>
      <ul className={styles.grid}>
        {PRODUCTS.map((w) => (
          <li key={w.id} className={styles.item}>
            <div className={styles.itemImage}>
              <Image src={w.image} alt={`${w.title}, by ${w.artist}`} fill sizes="(max-width: 640px) 100vw, 280px" />
            </div>
            <p className={styles.itemRoom}>{w.room}</p>
            <p className={styles.itemTitle}>{w.title}</p>
            <p className={styles.itemArtist}>{w.artist}</p>
            <p className={styles.itemMeta}>{meta(w)}</p>
            <button type="button" className={styles.itemLink} onClick={() => visit(w)}>
              See it in the room
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Over the showroom: the frame's hairlines, an eye icon on every work in view
 * (Scene.jsx keeps each on its work) that opens the work's card, the Rooms
 * menu and the fullscreen button.
 */
export function ShowroomOverlay() {
  const store = useGallery();
  const open = useSyncExternalStore(store.subscribeOpen, store.getOpen, () => null);
  const work = PRODUCTS.find((w) => w.id === open);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const roomsRef = useRef(null);
  const fullscreen = useSyncExternalStore(noSubscribe, canFullscreen, () => false);

  useEffect(() => {
    if (!roomsOpen) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !roomsRef.current?.contains(e.target)) setRoomsOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [roomsOpen]);

  // the card closes on Escape, or on a press anywhere but on it or an eye
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest?.(`.${styles.card}, .${styles.eye}`)) store.setOpen(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open, store]);

  const go = (p) => {
    setRoomsOpen(false);
    store.setOpen(null);
    store.scrollTo(p);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  return (
    <div className={gallery.overlay}>
      <div className={gallery.frame} aria-hidden="true">
        <span className={gallery.frameLeft} />
        <span className={gallery.frameRight} />
      </div>

      {PRODUCTS.map((w) => (
        <button
          key={w.id}
          type="button"
          className={styles.eye}
          data-visible="false"
          data-open={open === w.id}
          tabIndex={-1}
          ref={(el) => store.setEye(w.id, el)}
          onClick={() => store.setOpen(open === w.id ? null : w.id)}
          aria-label={`${w.title} by ${w.artist}: details`}
          aria-expanded={open === w.id}
          aria-controls="showroom-card"
        >
          <EyeIcon />
        </button>
      ))}

      <aside id="showroom-card" className={styles.card} data-open={Boolean(work)} ref={(el) => store.setCard(el)} aria-live="polite">
        {work && (
          <>
            <div className={styles.cardImage} style={{ aspectRatio: String(work.aspect) }}>
              <Image src={work.image} alt={`${work.title}, by ${work.artist}`} fill sizes="240px" />
            </div>
            <div className={styles.cardText}>
              <p className={styles.cardRoom}>{work.room}</p>
              <p className={styles.cardTitle}>{work.title}</p>
              <p className={styles.cardArtist}>{work.artist}</p>
              <p className={styles.cardMeta}>{meta(work)}</p>
            </div>
            <button type="button" className={styles.cardClose} onClick={() => store.setOpen(null)} aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </>
        )}
      </aside>

      <div className={gallery.bottomLeft} ref={roomsRef}>
        <button
          type="button"
          className={gallery.roomsButton}
          aria-expanded={roomsOpen}
          aria-controls="showroom-rooms"
          onClick={() => setRoomsOpen((v) => !v)}
        >
          <span>Rooms</span>
          <span className={gallery.bottomDivider} aria-hidden="true" />
          <PlanIcon />
        </button>
        <ul id="showroom-rooms" className={gallery.roomsMenu} data-open={roomsOpen} hidden={!roomsOpen}>
          {ROOMS.map((r) => (
            <li key={r.label}>
              <button type="button" onClick={() => go(r.p)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {fullscreen && (
        <button type="button" className={gallery.cornerButton} onClick={toggleFullscreen} aria-label="Toggle fullscreen">
          <ExpandIcon />
        </button>
      )}

      <span className={gallery.cursor} ref={(el) => store.setCursor(el)} aria-hidden="true" />
    </div>
  );
}
