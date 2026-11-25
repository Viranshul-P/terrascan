// Counts the picture requests (and their bytes) that one in-browser map makes, to tune the reading. Needs the internet.
// Usage (from web/): node scripts/count-reads.mjs [west south east north] [years, comma-separated]
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const bbox = process.argv.length > 5 ? process.argv.slice(2, 6).map(Number) : [70.77, 22.27, 70.81, 22.31];
const years = (process.argv[6] ?? "2026").split(",");
const server = await createServer({ root: resolve(import.meta.dirname, ".."), server: { port: 4321, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("http://localhost:4321/about");
await page.evaluate(() => import("/src/live/client.ts").then((m) => m.liveConfig())).catch(() => undefined);
await page.waitForTimeout(4000);
await page.goto("http://localhost:4321/about");
// Warm the model into the cache first, so only the pictures are measured.
await page.evaluate(async ({ bbox, years }) => (await import("/src/live/client.ts")).runLive(bbox, years, () => {}).then(() => "ok", (e) => String(e)), { bbox, years });
let n = 0;
context.on("request", (r) => { if (r.url().includes("blob.core.windows.net")) n++; });
const r = await page.evaluate(async ({ bbox, years }) => {
  const m = await (await import("/src/live/client.ts")).runLive(bbox, years, () => {});
  return { t: m.timings_ms, mb: m.bytes_read / 1e6, scenes: years.map((y) => m.info[y].n_scenes) };
}, { bbox, years });
console.log(JSON.stringify({ requests: n, ...r }));
await browser.close();
await server.close();
