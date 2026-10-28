"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HOTSPOTS } from "./path";
import { useGallery } from "./store";
import { CartIcon, ExpandIcon, EyeIcon, PlanIcon, SearchIcon, UserIcon } from "./icons";
import styles from "./gallery.module.css";

// scroll progress that frames each room (see the camera keys in scene/build_scene.py)
export const ROOMS = [
  { label: "Material library", p: 0 },
  { label: "Textile wall", p: 0.227 },
  { label: "Gallery room", p: 0.462 },
  { label: "The vault", p: 0.773 },
  { label: "Exhibition hall", p: 0.924 },
];

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

      <aside className={styles.card} ref={(el) => store.setCard(el)} aria-live="polite">
        <div className={styles.cardBody}>
          <p className={styles.cardEyebrow}>Exhibitions</p>
          <p className={styles.cardText}>Private viewings by appointment at ZA Gallery.</p>
        </div>
        <div className={styles.cardActions}>
          <a href="#contact">Book a viewing</a>
          <a href="#galleries">All galleries</a>
        </div>
      </aside>

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

      <button type="button" className={styles.cornerButton} onClick={toggleFullscreen} aria-label="Toggle fullscreen">
        <ExpandIcon />
      </button>

      <span className={styles.cursor} ref={(el) => store.setCursor(el)} aria-hidden="true" />
    </div>
  );
}
