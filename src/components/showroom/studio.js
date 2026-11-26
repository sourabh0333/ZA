import catalogue from "../gallery/data/catalogue.json";

// What the "Design your wall" studio offers: paints, frames, mounts and the
// Zigguratss catalogue's works at their real sizes. A design is
// { wall, art, frame, mount } and lives in the page's address (?wall=sage...),
// so it can be shared and reopened.

/** Paint colours (sRGB), a curated range of the usual interior shades. */
export const PAINTS = [
  { id: "linen", name: "Linen white", hex: "#eee8de" },
  { id: "greige", name: "Greige", hex: "#cfc6b8" },
  { id: "sage", name: "Sage", hex: "#a9b59b" },
  { id: "clay", name: "Clay", hex: "#c9a58a" },
  { id: "terracotta", name: "Terracotta", hex: "#b3674a" },
  { id: "olive", name: "Olive", hex: "#6e7151" },
  { id: "midnight", name: "Midnight", hex: "#2e3a4f" },
  { id: "charcoal", name: "Charcoal", hex: "#3a3836" },
];

/**
 * Frames: the moulding's face width and depth (metres) and its finish. "none"
 * is the canvas wrapped round its stretcher and hung bare.
 */
export const FRAMES = [
  { id: "none", name: "No frame", width: 0, depth: 0.038, swatch: "#6b6258" },
  { id: "black", name: "Thin black", width: 0.022, depth: 0.035, swatch: "#151413" },
  { id: "walnut", name: "Walnut", width: 0.045, depth: 0.045, swatch: "#5a3c2a" },
  { id: "oak", name: "Natural oak", width: 0.04, depth: 0.04, swatch: "#b48e64" },
  { id: "white", name: "White", width: 0.035, depth: 0.035, swatch: "#ecebe6" },
  { id: "gold", name: "Gold", width: 0.065, depth: 0.05, swatch: "#b8924a" },
];

/** The white card between a framed work and its frame, metres each side. */
export const MOUNTS = [
  { id: "none", name: "None", width: 0 },
  { id: "slim", name: "Slim", width: 0.05 },
  { id: "wide", name: "Wide", width: 0.1 },
];

/**
 * The catalogue's works with their real size in centimetres. The catalogue's
 * two numbers come in no fixed order, so the image gives the proportions and
 * the larger number the long side.
 */
export const WORKS = catalogue.map((w) => {
  const long = Math.max(...(w.size.match(/\d+/g) ?? ["60"]).map(Number));
  const [width, height] = w.aspect >= 1 ? [long, long / w.aspect] : [long * w.aspect, long];
  const shape = w.aspect > 1.15 ? "landscape" : w.aspect < 0.87 ? "portrait" : "square";
  return { ...w, width: Math.round(width), height: Math.round(height), shape };
});

export const DEFAULT = { wall: "greige", art: WORKS[0].id, frame: "walnut", mount: "slim" };

/** A design from the page's address (anything missing or unknown falls back to the default). */
export function fromSearch(search) {
  const q = new URLSearchParams(search);
  const pick = (key, list) => (list.some((x) => x.id === q.get(key)) ? q.get(key) : DEFAULT[key]);
  const wall = /^[0-9a-f]{6}$/i.test(q.get("wall") ?? "") ? `#${q.get("wall")}` : pick("wall", PAINTS);
  return { wall, art: pick("art", WORKS), frame: pick("frame", FRAMES), mount: pick("mount", MOUNTS) };
}

/** The page's address for a design. */
export function toSearch(design) {
  const q = new URLSearchParams();
  q.set("wall", design.wall.startsWith("#") ? design.wall.slice(1) : design.wall);
  q.set("art", design.art);
  q.set("frame", design.frame);
  q.set("mount", design.mount);
  return `?${q}`;
}

/** A wall's colour as hex, whether a named paint or a picked colour. */
export const wallHex = (wall) => (wall.startsWith("#") ? wall : PAINTS.find((p) => p.id === wall)?.hex ?? PAINTS[1].hex);

/** A wall's name, as the summary gives it. */
export const wallName = (wall) => (wall.startsWith("#") ? `Custom ${wall.toUpperCase()}` : PAINTS.find((p) => p.id === wall)?.name);
