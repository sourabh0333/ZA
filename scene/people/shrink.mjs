// Brings visitors already baked into public/gallery/people down to the web
// texture sizes in web.mjs, in place (only ever smaller, so safe to run again):
//   node scene/people/shrink.mjs [id ...]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, stat } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { meshopt } from "@gltf-transform/functions";
import { webTextures } from "./web.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = path.join(root, "public", "gallery", "people");
const only = process.argv.slice(2);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

for (const name of (await readdir(dir)).filter((f) => f.endsWith(".glb")).sort()) {
  if (only.length && !only.includes(path.basename(name, ".glb"))) continue;
  const file = path.join(dir, name);
  const before = (await stat(file)).size;
  const doc = await io.read(file);
  // (geometry and animation re-encoded as they were baked)
  await doc.transform(...webTextures(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(file, doc);
  const after = (await stat(file)).size;
  console.log(`${name.padEnd(22)} ${(before / 1024).toFixed(0).padStart(5)} KB -> ${(after / 1024).toFixed(0).padStart(5)} KB`);
}
