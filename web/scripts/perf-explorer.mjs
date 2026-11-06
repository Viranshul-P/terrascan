// Smoothness of the Explorer (step 5.3b), same method as perf-proto.mjs (step 5.3a): frame times from
// requestAnimationFrame in headless Chromium with the laptop's real GPU, at normal CPU and CPU slowed 4x.
// Measures the opening flight, panning the map, and dragging the compare slider. Mean of 3 runs.
// Usage (from web/): npm run build && node scripts/perf-explorer.mjs    (needs the internet for globe tiles)
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const RUNS = 3;
const ROOT = resolve(import.meta.dirname, "..", "..");
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4319, strictPort: true } });
const url = "http://localhost:4319";
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });

async function measure(page, action) {
  await page.evaluate(() => {
    window.__frames = []; window.__rec = true;
    let last = performance.now();
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await action();
  const f = await page.evaluate(() => { window.__rec = false; return window.__frames.slice(1); });
  const sorted = [...f].sort((a, b) => a - b);
  const total = f.reduce((a, b) => a + b, 0);
  return {
    avg_fps: 1000 / (total / f.length),
    p95_frame_ms: sorted[Math.floor(0.95 * sorted.length)],
    worst_frame_ms: sorted.at(-1),
    janky_share: f.filter((x) => x > 33.4).length / f.length,
  };
}

async function run(cpu) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const cdp = await page.context().newCDPSession(page);
  const out = {};
  // 1. Opening: a fresh visit, measured from the first frame until the flight has landed.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.goto(`${url}/explorer`);
  out.opening = await measure(page, () => page.waitForTimeout(8000));
  out.webgl = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  // 2. Pan: drag the map in a circle for ~4 s.
  out.pan = await measure(page, async () => {
    await page.mouse.move(720, 500); await page.mouse.down();
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      await page.mouse.move(720 + Math.cos(a) * 200, 500 + Math.sin(a) * 120);
      await page.waitForTimeout(50);
    }
    await page.mouse.up(); await page.waitForTimeout(500);
  });
  // 3. Compare: switch it on, then drag the slider back and forth.
  await page.keyboard.press("c");
  await page.waitForTimeout(4000);
  const sw = await page.locator(".swipe").boundingBox();
  out.compare_drag = await measure(page, async () => {
    await page.mouse.move(sw.x + sw.width / 2, sw.y + sw.height / 2); await page.mouse.down();
    for (let i = 0; i < 60; i++) { await page.mouse.move(400 + Math.abs(30 - i) * 22, 500); await page.waitForTimeout(50); }
    await page.mouse.up(); await page.waitForTimeout(300);
  });
  await page.close();
  return out;
}

const mean = (rs, k, m) => +(rs.reduce((a, r) => a + r[k][m], 0) / rs.length).toFixed(3);
const result = { made_by: "web/scripts/perf-explorer.mjs", date: new Date().toISOString().slice(0, 10), runs_each: RUNS,
  note: "Production build, headless Chromium, laptop GPU. 16.7 ms = 60 fps; janky = frames over 33 ms. cpu_x4 slows the CPU 4x as a rough stand-in for a mid-range phone." };
for (const cpu of [1, 4]) {
  const rs = [];
  for (let i = 0; i < RUNS; i++) rs.push(await run(cpu));
  result[`cpu_x${cpu}`] = { webgl: rs[0].webgl, ...Object.fromEntries(["opening", "pan", "compare_drag"].map((k) => [k, Object.fromEntries(Object.keys(rs[0][k]).map((m) => [m, mean(rs, k, m)]))])) };
}
const OUT = join(ROOT, "reports", "design", "5.3b");
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "perf_explorer.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
