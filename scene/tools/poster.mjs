// Converts the Blender poster render to WebP for the hero.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = path.join(root, "public", "gallery", "poster.webp");
const info = await sharp(path.join(root, "scene", "out", "poster.png")).webp({ quality: 80 }).toFile(out);
console.log(`wrote ${path.relative(root, out)} (${Math.round(info.size / 1024)} KB)`);
