// Prefilters the reflection panoramas for the website, once, at build time.
// Run after scene/bake.py: node scene/tools/pmrem.mjs
//
// The site's materials need each panorama as a PMREM (a "cube UV" atlas of the
// panorama blurred for every roughness). three.js can make one in the browser,
// but on many GPUs its filter shader compiles at its first draw and froze the
// page for a second or more while the hero loaded. So the same three.js
// PMREMGenerator runs here instead, in headless Chrome, and the atlas it makes
// is saved as an RGBE .hdr the site loads as is (CubeUVReflectionMapping).
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const gallery = path.join(root, "public", "gallery");
const ENVS = ["a", "b", "c"];
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const PAGE = `<!doctype html><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/three/build/three.module.js" } }</script>
<script type="module">
import * as THREE from "three";
import { HDRLoader } from "/three/examples/jsm/loaders/HDRLoader.js";
const renderer = new THREE.WebGLRenderer();
const pmrem = new THREE.PMREMGenerator(renderer);
// copies the half-float atlas into a float target, which every GPU can read back
const copy = new THREE.ShaderMaterial({
  uniforms: { map: { value: null } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }",
  depthTest: false, depthWrite: false, toneMapped: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy);
const camera = new THREE.Camera();
window.convert = async (url) => {
  const tex = await new HDRLoader().loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const atlas = pmrem.fromEquirectangular(tex);
  const { width, height } = atlas;
  const out = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
  copy.uniforms.map.value = atlas.texture;
  renderer.setRenderTarget(out);
  renderer.render(quad, camera);
  const px = new Float32Array(width * height * 4);
  renderer.readRenderTargetPixels(out, 0, 0, width, height, px);
  renderer.setRenderTarget(null);
  // RGBE, top scanline first (the read-back starts at the bottom)
  const rgbe = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((height - 1 - y) * width + x) * 4;
      const o = (y * width + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const v = Math.max(r, g, b);
      if (v < 1e-32) continue;
      const e = Math.ceil(Math.log2(v));
      const f = 256 / Math.pow(2, e);
      rgbe[o] = Math.min(255, r * f);
      rgbe[o + 1] = Math.min(255, g * f);
      rgbe[o + 2] = Math.min(255, b * f);
      rgbe[o + 3] = e + 128;
    }
  }
  let s = "";
  for (let i = 0; i < rgbe.length; i += 32768) s += String.fromCharCode(...rgbe.subarray(i, i + 32768));
  return { width, height, data: btoa(s) };
};
window.ready = true;
</script>`;

/** Radiance run-length encoding (Greg Ward's RGBE.c), one scanline at a time. */
function encodeRLE(rgbe, width, height) {
  const out = [];
  const d = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    out.push(2, 2, width >> 8, width & 255);
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < width; x++) d[x] = rgbe[(y * width + x) * 4 + c];
      let cur = 0;
      while (cur < width) {
        let begRun = cur;
        let runCount = 0;
        let oldRunCount = 0;
        while (runCount < 4 && begRun < width) {
          begRun += runCount;
          oldRunCount = runCount;
          runCount = 1;
          while (begRun + runCount < width && runCount < 127 && d[begRun] === d[begRun + runCount]) runCount++;
        }
        if (oldRunCount > 1 && oldRunCount === begRun - cur) {
          out.push(128 + oldRunCount, d[cur]);
          cur = begRun;
        }
        while (cur < begRun) {
          const n = Math.min(128, begRun - cur);
          out.push(n);
          for (let k = 0; k < n; k++) out.push(d[cur + k]);
          cur += n;
        }
        if (runCount >= 4) {
          out.push(128 + runCount, d[begRun]);
          cur += runCount;
        }
      }
    }
  }
  return Buffer.from(out);
}

const types = { ".js": "text/javascript", ".hdr": "application/octet-stream" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") return res.end(PAGE);
  const file = url.startsWith("/three/")
    ? path.join(root, "node_modules", "three", url.slice(7))
    : path.join(gallery, url.replace(/^\/gallery\//, ""));
  try {
    res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const profile = mkdtempSync(path.join(tmpdir(), "pmrem-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9339", `--user-data-dir=${profile}`,
  "--enable-gpu", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  target = await fetch("http://127.0.0.1:9339/json").then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 500));
  return m.result.result.value;
};

try {
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 80 && !(await evaluate("!!window.ready").catch(() => false)); i++) await sleep(250);
  for (const env of ENVS) {
    const { width, height, data } = await evaluate(`convert("/gallery/env_${env}.hdr")`);
    const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, "ascii");
    const file = path.join(gallery, `env_${env}.pmrem.hdr`);
    writeFileSync(file, Buffer.concat([header, encodeRLE(Buffer.from(data, "base64"), width, height)]));
    console.log(`wrote ${path.relative(root, file)} (${width}x${height})`);
  }
} finally {
  ws.close();
  chrome.kill();
  server.close();
  // (Chrome lets go of its profile folder a moment after it exits)
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      // still locked: try again
    }
  }
}
