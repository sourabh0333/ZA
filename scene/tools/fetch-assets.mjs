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
  // the showroom (build_showroom.py): boucle upholstery, the bathroom's
  // terrazzo, bed linen, dark walnut joinery
  wool_boucle: "1k",
  terrazzo_tiles: "2k",
  rough_linen: "1k",
  black_walnut_veneer_01: "1k",
  wood_floor: "2k",
};
const MAPS = ["Diffuse", "nor_gl", "Rough"];

const MODELS = {
  ArmChair_01: "1k",
  GreenChair_01: "1k",
  ceramic_vase_02: "1k",
  brass_vase_01: "1k",
  // sculpture: a marble bust, a rearing porcelain horse, a bronze manta ray,
  // a bronze whale, bronze lion and horse heads, a weathered gothic figure and
  // a carved elephant
  marble_bust_01: "1k",
  horse_statue_01: "1k",
  bronze_ray_statue: "1k",
  bronze_whale_statue: "1k",
  lion_head: "1k",
  horse_head: "1k",
  gothic_statue: "1k",
  carved_wooden_elephant: "1k",
  // the showroom: bar stools, a marble side table, the kitchen's vessels and
  // wine, the living room's plant and cushions
  bar_chair_round_01: "1k",
  coffee_table_round_01: "1k",
  ceramic_vase_01: "1k",
  ceramic_vase_03: "1k",
  ceramic_vase_04: "1k",
  wine_bottles_01: "1k",
  potted_plant_02: "1k",
  throw_pillows_01: "1k",
  wooden_bowl_01: "1k",
  dining_chair_02: "1k",
  modern_wooden_cabinet: "1k",
  modern_ceiling_lamp_01: "1k",
  book_encyclopedia_set_01: "1k",
  potted_plant_01: "1k",
  potted_plant_04: "1k",
  mid_century_lounge_chair: "1k",
  modern_arm_chair_01: "1k",
};
// the showroom's view through its windows: a meadow under mountains
const HDRIS = { alps_field: "4k" };

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
for (const [id, res] of Object.entries(HDRIS)) {
  console.log("hdri", id);
  const h = (await files(id)).hdri[res].hdr;
  await download(h.url, path.join(root, "hdri", path.basename(new URL(h.url).pathname)));
}
console.log("done");
