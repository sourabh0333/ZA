// Bakes the gallery's visitors (cast.json) into web-ready glTF files:
//   node scene/people/bake.mjs <rocketbox Assets dir>
// Run scene/people/textures.py first. Each avatar is loaded with its idle clip
// in headless Chromium (bake.html, three.js FBXLoader + GLTFExporter), then
// compressed like the gallery model: meshopt geometry and animation, WebP textures.
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

// (required, not imported: a global Playwright install is found through NODE_PATH)
const { chromium } = createRequire(import.meta.url)("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const assets = path.resolve(process.argv[2] ?? "");
const raw = path.join(root, "scene", "out", "people", "raw");
const output = path.join(root, "public", "gallery", "people");
const { people } = JSON.parse(await readFile(path.join(here, "cast.json"), "utf8"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };
const ROUTES = {
  "/three/": path.join(root, "node_modules", "three"),
  "/rb/": assets,
  "/tex/": path.join(root, "scene", "out", "people", "tex"),
  "/": here,
};

await mkdir(raw, { recursive: true });
await mkdir(output, { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (req.method === "POST" && url.startsWith("/out/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await writeFile(path.join(raw, path.basename(url)), Buffer.concat(chunks));
    res.end("ok");
    return;
  }
  const [prefix, dir] = Object.entries(ROUTES).find(([p]) => url.startsWith(p));
  const file = path.join(dir, url.slice(prefix.length));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, done));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
for (const p of people) {
  const page = await browser.newPage();
  await page.goto(`${base}/bake.html?id=${p.id}&avatar=${p.avatar}&anim=${p.anim}`);
  await page.waitForFunction(() => window.done || window.failed, null, { timeout: 300000 });
  const failed = await page.evaluate(() => window.failed);
  if (failed) throw new Error(`${p.id}: ${failed}`);
  await page.close();
  console.log(`baked ${p.id} (${p.avatar}, ${p.anim})`);
}
await browser.close();
server.close();

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

for (const p of people) {
  const doc = await io.read(path.join(raw, `${p.id}.glb`));
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    // about half the triangles: still smooth at the distances visitors are seen from
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0005 }),
    // mocap is keyed every frame; drop the keys a straight line between neighbours reproduces
    resample({ tolerance: 2e-4 }),
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 80, resize: [1024, 1024], slots: /^baseColor/ }),
    // (hair cut-outs arrive already at 512 from textures.py)
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 80, resize: [512, 512], slots: /^(normal|metallicRoughness)/ }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const out = path.join(output, `${p.id}.glb`);
  await io.write(out, doc);
  const { size } = await stat(out);
  console.log(`wrote ${path.relative(root, out)} (${(size / 1024).toFixed(0)} KB)`);
}
