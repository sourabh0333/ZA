// Downloads the CC0 source assets (Poly Haven) used to build the gallery scene.
// Run: node scene/tools/fetch-assets.mjs
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const UA = { "User-Agent": "za-gallery-build/1.0" };

const TEXTURES = {
  smooth_concrete_floor: "2k",
  poly_wool_herringbone: "1k",
  grey_plaster_02: "2k",
  clay_plaster: "2k",
  marble_01: "2k",
  velour_velvet: "1k",
  american_walnut_veneer: "2k",
  smoked_walnut_veneer: "1k",
  oak_veneer_01: "2k",
};
const MAPS = ["Diffuse", "nor_gl", "Rough"];

const MODELS = {
  ArmChair_01: "1k",
  GreenChair_01: "1k",
  ceramic_vase_02: "1k",
  brass_vase_01: "1k",
};

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url, file) {
  if (await exists(file)) return;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log("  +", path.relative(root, file));
}

async function files(id) {
  const res = await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} files/${id}`);
  return res.json();
}

for (const [id, res] of Object.entries(TEXTURES)) {
  console.log("texture", id);
  const f = await files(id);
  for (const map of MAPS) {
    const entry = f[map]?.[res]?.jpg;
    if (!entry) throw new Error(`missing ${map} ${res} for ${id}`);
    await download(entry.url, path.join(root, "textures", id, `${map}.jpg`));
  }
}

for (const [id, res] of Object.entries(MODELS)) {
  console.log("model", id);
  const g = (await files(id)).gltf[res].gltf;
  const dir = path.join(root, "models", id);
  await download(g.url, path.join(dir, path.basename(new URL(g.url).pathname)));
  for (const [rel, inc] of Object.entries(g.include)) {
    await download(inc.url, path.join(dir, rel));
  }
}
console.log("done");
