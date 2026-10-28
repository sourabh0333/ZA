"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HOTSPOTS, LABELS, ROOMS } from "./path";
import { useGallery } from "./store";
import { CartIcon, ExpandIcon, EyeIcon, PlanIcon, SearchIcon, UserIcon } from "./icons";
import styles from "./gallery.module.css";

// each work's place in the walk, for the caption's "No. 04 / 17"
const WORK_NUMBER = new Map(LABELS.flatMap((l) => l.works).map((w, i) => [w.title, i + 1]));

const noSubscribe = () => () => {};
// iPhone Safari (and some in-app browsers) cannot take a page fullscreen
const canFullscreen = () => Boolean(document.fullscreenEnabled);

// menu items carried over from the previous zigguratss.com site
const PRIMARY_LINKS = [
  { label: "Home", href: "/" },
  { label: "Artwork", href: "/artworks" },
  { label: "Artist", href: "/artists" },
  { label: "About", href: "/about" },
];

const SECONDARY_LINKS = [
  { label: "Blog", href: "/blog" },
  { label: "Contest", href: "/contest" },
  { label: "Contact", href: "/contact" },
];

export function SiteHeader() {
  const store = useGallery();
  return (
    <header className={styles.header} ref={(el) => store?.setHeader(el)}>
      <Link className={styles.logo} href="/" aria-label="Zigguratss home">
        <Image
          src="/brand/zigguratss-logo.png"
          width={208}
          height={208}
          alt="Zigguratss"
          className={styles.logoImage}
          priority
        />
      </Link>
      <nav className={styles.centerNav} aria-label="Primary">
        {PRIMARY_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
      <nav className={styles.rightNav} aria-label="Secondary">
        <span className={styles.navTab} aria-hidden="true" />
        {SECONDARY_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        <span className={styles.navDivider} aria-hidden="true" />
        <div className={styles.iconGroup}>
          <button type="button" className={styles.iconButton} aria-label="Search">
            <SearchIcon />
          </button>
          <button type="button" className={styles.iconButton} aria-label="Account">
            <UserIcon />
          </button>
          <button type="button" className={styles.iconButton} aria-label="Cart">
            <CartIcon />
          </button>
        </div>
      </nav>
    </header>
  );
}

export function StageOverlay() {
  const store = useGallery();
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

  const go = (p) => {
    setRoomsOpen(false);
    store.scrollTo(p);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.frame} aria-hidden="true">
        <span className={styles.frameLeft} />
        <span className={styles.frameRight} />
      </div>

      {HOTSPOTS.map((h) => (
        <button
          key={h.id}
          type="button"
          className={styles.hotspot}
          aria-label={h.label}
          ref={(el) => store.setHotspot(h.id, el)}
          onClick={() => go((h.range[0] + h.range[1]) / 2)}
        >
          <EyeIcon />
        </button>
      ))}

      {LABELS.map((l) => (
        <aside
          key={l.id}
          className={styles.caption}
          data-count={l.works.length}
          ref={(el) => store.setLabel(l.id, el)}
          aria-hidden="true"
        >
          {l.works.map((w) => (
            <div key={w.title} className={styles.captionWork}>
              <p className={styles.captionIndex}>
                No. {String(WORK_NUMBER.get(w.title)).padStart(2, "0")}
                <span>/ {String(WORK_NUMBER.size).padStart(2, "0")}</span>
              </p>
              <p className={styles.captionTitle}>{w.title}</p>
              <p className={styles.captionArtist}>{w.artist}</p>
              <p className={styles.captionMeta}>
                {w.medium}
                <span aria-hidden="true">·</span>
                {w.year}
                <span aria-hidden="true">·</span>
                {w.size}
              </p>
            </div>
          ))}
          <span className={styles.captionProgress} aria-hidden="true">
            <span />
          </span>
        </aside>
      ))}

      <div className={styles.bottomLeft} ref={roomsRef}>
        <button
          type="button"
          className={styles.roomsButton}
          aria-expanded={roomsOpen}
          aria-controls="gallery-rooms"
          onClick={() => setRoomsOpen((v) => !v)}
        >
          <span>Rooms</span>
          <span className={styles.bottomDivider} aria-hidden="true" />
          <PlanIcon />
        </button>
        <ul id="gallery-rooms" className={styles.roomsMenu} data-open={roomsOpen} hidden={!roomsOpen}>
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
        <button type="button" className={styles.cornerButton} onClick={toggleFullscreen} aria-label="Toggle fullscreen">
          <ExpandIcon />
        </button>
      )}

      <span className={styles.cursor} ref={(el) => store.setCursor(el)} aria-hidden="true" />
    </div>
  );
}
