// Our own load check (step 5.3d): phone-sized window, CPU slowed 4x, production build served locally (no network delay).
// Reports LCP and layout shift of the first paint, and how long the page was blocked (long tasks, the part over 50 ms)
// (a) while it settled, with the visitor doing nothing, and (b) in the 6 seconds after a first scroll, when the live map
// starts. Saves reports/design/<step>/load_metrics.json. Needs the internet (globe tiles).
// Usage (from web/): npm run build && node scripts/load-check.mjs 5.3d
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const step = process.argv[2] ?? "5.3d";
const OUT = join(resolve(import.meta.dirname, "..", ".."), "reports", "design", step);
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4323, strictPort: true } });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const runs = [];
for (let i = 0; i < 3; i++) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0; window.__blocked = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__blocked += Math.max(0, e.duration - 50)))).observe({ type: "longtask", buffered: true });
  });
  await page.goto("http://localhost:4323/", { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  const settled = await page.evaluate(() => ({ lcp_ms: Math.round(window.__lcp), cls: +window.__cls.toFixed(3), blocked_ms: Math.round(window.__blocked) }));
  await page.evaluate(() => { window.__blocked = 0; scrollBy(0, 2); }); // the first scroll
  await page.waitForSelector('.story-map[data-ready="true"]', { timeout: 90000 });
  await page.waitForTimeout(6000);
  const afterScroll = await page.evaluate(() => ({ blocked_ms: Math.round(window.__blocked), cls: +window.__cls.toFixed(3) }));
  runs.push({ while_settling: settled, six_seconds_after_first_scroll: afterScroll });
  await page.close();
}
const res = { made_by: "web/scripts/load-check.mjs", date: new Date().toISOString().slice(0, 10),
  note: "Story page, production build on this laptop (local files, no network delay), phone-sized window, CPU slowed 4x, 3 runs. Budget: LCP < 2500 ms, CLS < 0.1. blocked_ms = time over 50 ms summed over long tasks.", runs };
await writeFile(join(OUT, "load_metrics.json"), JSON.stringify(res, null, 2));
console.log(JSON.stringify(res.runs));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
