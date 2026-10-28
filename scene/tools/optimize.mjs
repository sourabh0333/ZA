// Compresses the exported glTF for the web: meshopt geometry, WebP textures.
// Run after scene/export.py: node scene/tools/optimize.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, stat } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const input = path.join(root, "scene", "out", "gltf", "gallery.gltf");
const output = path.join(root, "public", "gallery", "model", "gallery.glb");

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(input);
// export.py routes a white placeholder through the occlusion slot only so the
// lightmap UVs (TEXCOORD_1) get exported; drop it but keep the attribute.
for (const mat of doc.getRoot().listMaterials()) mat.setOcclusionTexture(null);
await doc.transform(
  dedup(),
  prune({ keepExtras: true, keepAttributes: true }),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82, resize: [1024, 1024], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 80, resize: [512, 512], slots: /^(normal|metallicRoughness|emissive|occlusion)/ }),
  // lightmap UVs need more precision than the default 12 bits or seams appear
  meshopt({ encoder: MeshoptEncoder, level: "medium", quantizePosition: 14, quantizeTexcoord: 16, quantizeNormal: 10 }),
);
await mkdir(path.dirname(output), { recursive: true });
await io.write(output, doc);
const { size } = await stat(output);
console.log(`wrote ${path.relative(root, output)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
