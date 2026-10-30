"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ROOMS, WORKS } from "./path";
import { useGallery } from "./store";
import { CartIcon, ExpandIcon, PlanIcon, SearchIcon, UserIcon } from "./icons";
import styles from "./gallery.module.css";


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

/**
 * The welcome over the first view: the gallery's name and an invitation to
 * walk in, in the intro's lettering, in the dark above the reception wall.
 * It rises in as the intro lifts (shown) and fades as the walk begins
 * (Scene.jsx sets --away from the camera's progress).
 */
export function Welcome({ shown }) {
  const store = useGallery();
  return (
    <div className={styles.welcomeWrap} data-shown={shown} ref={(el) => store.setWelcome(el)} aria-hidden="true">
      {/* (a soft dark from the top, so the gold reads over a lit wall on wide screens) */}
      <div className={styles.welcomeShade} />
      <div className={styles.welcome}>
        <p className={styles.welcomeRule}>
          <span>Zigguratss &middot; Art Gallery</span>
        </p>
        <p className={styles.welcomeTitle}>Step Inside the Gallery</p>
        <p className={styles.welcomeSub}>Scroll to walk through six rooms of original art</p>
        <span className={styles.welcomeCue} />
      </div>
    </div>
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

      {/* each work's wall label: shows by itself as the camera arrives at the work
          (Scene.jsx places it under the work, or beside it where there is no room) */}
      {WORKS.map((w) => (
        <aside key={w.id} className={styles.artLabel} ref={(el) => store.setWork(w.id, el)}>
          <p className={styles.artLabelTitle}>{w.title}</p>
          <p className={styles.artLabelArtist}>{w.artist}</p>
          <p className={styles.artLabelMeta}>
            {w.year}
            <span aria-hidden="true">·</span>
            {w.medium}
            <span aria-hidden="true">·</span>
            {w.size}
          </p>
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
