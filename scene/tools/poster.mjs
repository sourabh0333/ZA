// Captures the hero poster from the running site: its real first frame, so the
// poster and the 3D view it hands over to match exactly (a Blender render never
// quite did: different renderer, grading and lens shift).
// Run with the site up (npm run dev or npm start): node scene/tools/poster.mjs [url]
//
// 2400 x 1200 (2:1) at one canvas pixel per CSS pixel. The view's height is
// fixed by the camera, so with object-fit: cover the poster lines up with the
// 3D view on any screen from 2:1 down to 4:3.
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// (imported by GalleryHero.jsx, so its URL changes with its content)
const out = path.join(root, "src", "components", "gallery", "poster.webp");
const url = process.argv[2] || "http://localhost:3001/";
const [W, H] = [2400, 1200];
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const profile = mkdtempSync(path.join(tmpdir(), "poster-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9341", `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  target = await fetch("http://127.0.0.1:9341/json").then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.value;

try {
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  // wait for the 3D view to replace the old poster, then let it settle
  for (let i = 0; i < 240 && !(await evaluate(`document.querySelector('[data-hidden="true"] img') !== null`)); i++) await sleep(250);
  await sleep(2500);
  // just the view: no header, overlay, vignette, loader or poster
  await evaluate(`(() => {
    const s = document.createElement('style');
    s.textContent = 'header, [class*="overlay"], [class*="vignette"], [class*="loader"], [class*="posterWrap"] { display: none !important; }';
    document.head.append(s);
  })()`);
  await sleep(500);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const info = await sharp(Buffer.from(shot.data, "base64")).webp({ quality: 82 }).toFile(out);
  console.log(`wrote ${path.relative(root, out)} (${W}x${H}, ${Math.round(info.size / 1024)} KB)`);
} finally {
  ws.close();
  chrome.kill();
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      // Chrome still holds its profile folder: try again
    }
  }
}
