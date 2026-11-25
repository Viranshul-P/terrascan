// Runs the in-browser mapping engine (src/live/) in headless Chromium on the boxes in configs/browser_parity.yaml,
// one year at a time, and saves every square's class, confidence and centre to results/browser_parity_runs.json.
// src/browser_parity.py then compares it with the Python pipeline. Needs the internet (Planetary Computer, the Hub).
// Usage (from web/): node scripts/browser-parity.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const cfgText = await readFile(join(ROOT, "configs", "browser_parity.yaml"), "utf-8");
// The YAML is simple: read the box lines and the years line without a YAML library.
const boxes = Object.fromEntries([...cfgText.matchAll(/^ {2}(\w+): \[([^\]]+)\]/gm)].map((m) => [m[1], m[2].split(",").map(Number)]));
const years = JSON.parse(cfgText.match(/^years: (\[.*\])/m)[1]);
const out = join(ROOT, cfgText.match(/^browser_runs: (\S+)/m)[1]);

const server = await createServer({ root: resolve(import.meta.dirname, ".."), server: { port: 4319, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
// The dev server may reload the page once while it prepares onnxruntime-web and geotiff: warm it up first.
await page.goto("http://localhost:4319/about");
await page.evaluate(() => import("/src/live/client.ts").then((m) => m.liveConfig())).catch(() => undefined);
await page.waitForTimeout(4000);
await page.goto("http://localhost:4319/about");
const runs = [];
for (const [name, bbox] of Object.entries(boxes)) {
  for (const year of years) {
    const r = await page.evaluate(async ({ bbox, year }) => {
      const { runLive } = await import("/src/live/client.ts");
      try {
        const m = await runLive(bbox, [year], () => {});
        return {
          ok: true, tile: m.tile, n_patches: m.n_patches, scenes: m.info[year].scenes, backend: m.backend, timings_ms: m.timings_ms, bytes_read: m.bytes_read,
          patches: m.patches_geojson.features.map((f) => {
            const ring = f.geometry.coordinates[0].slice(0, 4);
            return { cls: f.properties[`class_${year}`], conf: f.properties[`confidence_${year}`], lon: ring.reduce((a, p) => a + p[0], 0) / 4, lat: ring.reduce((a, p) => a + p[1], 0) / 4 };
          }),
        };
      } catch (e) { return { ok: false, error: String(e.message ?? e) }; }
    }, { bbox, year });
    console.log(name, year, r.ok ? `${r.n_patches} squares, ${r.backend}, ${r.timings_ms.total} ms` : r.error);
    runs.push({ name, bbox, year, ...r });
  }
}
await writeFile(out, JSON.stringify({ made_by: "web/scripts/browser-parity.mjs", browser: browser.version(), runs }, null, 1) + "\n");
await browser.close();
await server.close();
console.log(`wrote ${out}`);
