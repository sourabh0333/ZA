// Fetches artworks from zigguratss.com for the gallery's walls: each listed
// painting's title, artist, medium, size and page, and its image, resized for
// the web. The website hangs them in rotation (src/components/gallery/hanging.js).
// Run: node scene/tools/fetch-zigguratss.mjs [how many, default 80]
//
// The listing pages carry every card's details as data attributes (the title,
// image and size in cm) beside the artist's link; paging is done in the
// browser, so the works come from the category pages, 20 to a page, deduplicated.
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = path.join(root, "public", "gallery", "art");
const CATALOGUE = path.join(root, "src", "components", "gallery", "data", "catalogue.json");
const SITE = "https://zigguratss.com";
const UA = { "User-Agent": "Mozilla/5.0 (zigguratss gallery build)" };
const WANT = Number(process.argv[2] || 80);
const CATEGORIES = [
  "painting", "painting/abstract", "painting/abstraction", "painting/landscape", "painting/figurative", "painting/geometric",
  "painting/expressionism", "painting/cubism", "painting/fine-art", "painting/marine", "painting/everyday-life",
  "painting/animal", "painting/conceptual", "painting/oil", "painting/water", "painting/acrylic-on-canvas", "painting/mixmedia",
  "painting/soft-pastel", "painting/charcoal",
];
// (the gallery's frames run from about 1:2.4 to 2.4:1)
const MIN_ASPECT = 0.42;
const MAX_ASPECT = 2.4;
const MAX_PX = 1024;

const attr = (html, name) => (html.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
const decode = (s) =>
  (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const titleCase = (s) => (s && s === s.toLowerCase() ? s.replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : s);
// (artists' names as on a wall label: each word capitalised)
const name = (s) => s.replace(/(^|[\s.-])(\p{Ll})/gu, (_, sep, c) => sep + c.toUpperCase());
const cm = (v) => Math.round(Number(v));

/** The cards on one listing page. */
function cards(html) {
  return html
    .split('class="artwork-list-item"')
    .slice(1)
    .map((block) => {
      const id = attr(block, "data-id");
      const page = attr(block, "data-user_url") || "";
      const image = (attr(block, "data-image") || "").replace("/./", "/");
      const title = decode(attr(block, "data-pro_name"));
      const width = attr(block, "data-cmwidth");
      const height = attr(block, "data-length");
      const artist = decode((block.match(/class="artwork-artist artwork_name">([^<]*)</) || [])[1]);
      // the page's path names the medium: .../<medium>/<slug>-<id>
      const parts = page.replace(SITE, "").split("/").filter(Boolean);
      const medium = parts.length > 2 ? decode(parts[parts.length - 2].replace(/-+/g, " ")) : "";
      return { id, page, image, title, artist, width, height, medium };
    })
    .filter((c) => c.id && c.image && c.title && !c.image.includes("{") && !c.title.includes("+"));
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

await mkdir(OUT_DIR, { recursive: true });
const seen = new Map();
for (const cat of CATEGORIES) {
  const res = await fetch(`${SITE}/artworks/${cat}`, { headers: UA });
  if (!res.ok) {
    console.log("  skip", cat, res.status);
    continue;
  }
  const found = cards(await res.text());
  for (const c of found) if (!seen.has(c.id)) seen.set(c.id, c);
  console.log(`${cat}: ${found.length} cards, ${seen.size} works so far`);
}

const works = [];
for (const c of seen.values()) {
  if (works.length >= WANT) break;
  const file = path.join(OUT_DIR, `z${c.id}.webp`);
  try {
    let meta;
    if (!(await exists(file))) {
      const res = await fetch(c.image, { headers: UA });
      if (!res.ok) throw new Error(`${res.status}`);
      const img = sharp(Buffer.from(await res.arrayBuffer())).rotate();
      meta = await img.metadata();
      if (Math.max(meta.width, meta.height) < 500) throw new Error(`only ${meta.width} x ${meta.height}`);
      await img.resize(MAX_PX, MAX_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(file);
    }
    meta = await sharp(file).metadata();
    const aspect = meta.width / meta.height;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) throw new Error(`aspect ${aspect.toFixed(2)}`);
    works.push({
      id: `z${c.id}`,
      title: titleCase(c.title),
      artist: name(c.artist),
      medium: c.medium ? c.medium[0].toUpperCase() + c.medium.slice(1) : "",
      size: c.width && c.height ? `${cm(c.width)} × ${cm(c.height)} cm` : "",
      page: c.page,
      image: `/gallery/art/z${c.id}.webp`,
      aspect: +aspect.toFixed(3),
    });
    console.log(`  + ${c.title} (${c.artist}) ${meta.width}x${meta.height}`);
  } catch (e) {
    console.log(`  - ${c.title}: ${e.message}`);
  }
}
await writeFile(CATALOGUE, JSON.stringify(works, null, 1) + "\n");
console.log(`wrote ${works.length} works to ${path.relative(root, CATALOGUE)}`);
