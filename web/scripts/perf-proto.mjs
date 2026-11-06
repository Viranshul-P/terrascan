// Smoothness check for a design prototype (step 5.3a). Scrolls the Story page and pans the Explorer map while
// counting animation frames, then saves frame-time numbers to reports/design/5.3a/perf_<proto>.json.
// Usage (from web/): node scripts/perf-proto.mjs d [--runs 3] [--story-only]   (needs the internet for globe tiles)
// Runs twice: normal CPU, and CPU slowed 4x (Chrome DevTools throttling) as a rough stand-in for a mid-range phone.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const proto = process.argv[2] ?? "d";
const argv = process.argv.slice(3);
const RUNS = argv.includes("--runs") ? Number(argv[argv.indexOf("--runs") + 1]) : 1;
const STORY_ONLY = argv.includes("--story-only");
const ROOT = resolve(import.meta.dirname, "..", "..");
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".csv": "text/csv", ".geojson": "application/geo+json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/web/prototypes/${proto}`;

// Real GPU (not the software renderer the screenshot script uses), so WebGL costs are realistic for a laptop.
const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] });

// Records the time between animation frames while `action` runs.
async function measure(page, action) {
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    window.__rec = true;
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await action();
  const f = await page.evaluate(() => { window.__rec = false; return window.__frames.slice(1); });
  const sorted = [...f].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const total = f.reduce((a, b) => a + b, 0);
  return {
    frames: f.length,
    avg_fps: +(1000 / (total / f.length)).toFixed(1),
    median_frame_ms: +q(0.5).toFixed(1),
    p95_frame_ms: +q(0.95).toFixed(1),
    worst_frame_ms: +sorted.at(-1).toFixed(1),
    janky_frames_over_33ms: f.filter((x) => x > 33.4).length,
    janky_share: +(f.filter((x) => x > 33.4).length / f.length).toFixed(3),
  };
}

async function run(cpuSlowdown) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const cdp = await page.context().newCDPSession(page);
  const out = {};

  await page.goto(`${base}/index.html`);
  await page.waitForTimeout(4000);
  out.webgl = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  await page.mouse.move(720, 450);
  // Scroll the whole Story page (story, then everything below it) at a steady pace: 120 px every 50 ms, like a trackpad.
  out.story_scroll = await measure(page, async () => {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 120) { await page.mouse.wheel(0, 120); await page.waitForTimeout(50); }
    await page.waitForTimeout(1500);
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  if (STORY_ONLY) { await page.close(); return out; }

  await page.goto(`${base}/explorer.html`);
  await page.waitForTimeout(4000);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  // Drag the map around in a circle for ~4 s.
  out.explorer_pan = await measure(page, async () => {
    await page.mouse.move(720, 500);
    await page.mouse.down();
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      await page.mouse.move(720 + Math.cos(a) * 200, 500 + Math.sin(a) * 120);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
  });
  await page.close();
  return out;
}

// Several runs, then the mean of each number (one run varies a lot: map flights and scrolling overlap differently).
async function runs(cpu) {
  const all = [];
  for (let i = 0; i < RUNS; i++) all.push(await run(cpu));
  if (RUNS === 1) return all[0];
  const mean = (k, m) => +(all.reduce((a, r) => a + r[k][m], 0) / RUNS).toFixed(3);
  const out = { webgl: all[0].webgl, runs: RUNS };
  for (const k of Object.keys(all[0]).filter((k) => k !== "webgl")) out[k] = Object.fromEntries(Object.keys(all[0][k]).map((m) => [m, mean(k, m)]));
  return out;
}

const result = {
  prototype: proto,
  runs_each: RUNS,
  made_by: "web/scripts/perf-proto.mjs",
  date: new Date().toISOString().slice(0, 10),
  note: "Frame times from requestAnimationFrame in headless Chromium on this laptop. 16.7 ms = 60 fps. " +
    "cpu_x4 slows the CPU 4x as a rough stand-in for a mid-range phone (the GPU is not slowed).",
  cpu_x1: await runs(1),
  cpu_x4: await runs(4),
};
const file = join(ROOT, "reports", "design", "5.3a", `perf_${proto}${process.env.PERF_TAG ?? ""}.json`);
await writeFile(file, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
