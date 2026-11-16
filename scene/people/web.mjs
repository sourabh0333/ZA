// How big a visitor's textures are on the web, shared by bake.mjs (new bakes)
// and shrink.mjs (bakes already in public/). A figure is never seen closer than
// a couple of metres, nor taller than a few hundred pixels on screen, and every
// texture it carries is uploaded to the GPU (the costliest thing a first visit
// does) and held there, so the skin and clothes are 512 px and their normal and
// roughness maps 256 px: a quarter of the memory of 1024/512, and no visible change.
import { textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

export const webTextures = () => [
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82, resize: [512, 512], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 80, resize: [256, 256], slots: /^(normal|metallicRoughness)/ }),
];
