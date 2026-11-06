// Screenshots of the design-system page (step 5.3a part 2) into reports/design/5.3a/ds/, from the production build.
// Also records load metrics against the PLAN.md budget (LCP < 2.5 s, layout shift < 0.1) with the CPU slowed 4x.
// Usage (from web/): npm run build && npm run shots:ds
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "reports", "design", "5.3a", "ds");
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4317, strictPort: true } });
const url = "http://localhost:4317/design";
const browser = await chromium.launch();
const errors = [];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, scale: 1 },
  { name: "phone", width: 390, height: 844, scale: 2 },
];
for (const vp of VIEWPORTS) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${vp.name}-${scheme}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.scale });
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    await page.goto(url);
    await page.waitForSelector(".ds-hero");
    await page.screenshot({ path: join(OUT, `top-${tag}.jpg`), type: "jpeg", quality: 82 });
    // Scroll through once so every section has risen in and every number has counted, then shoot the whole page.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } });
    await page.waitForTimeout(1500);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: join(OUT, `full-${tag}.jpg`), type: "jpeg", quality: 82, fullPage: true });
    if (vp.name === "desktop") {
      // Interaction states: pointing at a legend row, an open source note, a hovered card.
      await page.locator("#controls").scrollIntoViewIfNeeded();
      await page.click(".seg button >> nth=0");
      await page.hover(".leg >> nth=0");
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `controls-${tag}.jpg`), type: "jpeg", quality: 82 });
      await page.locator("#stats").scrollIntoViewIfNeeded();
      await page.hover(".card-interactive >> nth=1");
      await page.click(".src-btn >> nth=1");
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `stats-${tag}.jpg`), type: "jpeg", quality: 82 });
    }
    await page.close();
  }
}

// Load metrics: a fresh page, CPU 4x slower, measure Largest Contentful Paint and layout shift.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.addInitScript(() => {
  window.__lcp = 0; window.__cls = 0;
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const metrics = await page.evaluate(() => ({ lcp_ms: Math.round(window.__lcp), cls: +window.__cls.toFixed(3) }));
const result = {
  made_by: "web/scripts/shoot-ds.mjs",
  date: new Date().toISOString().slice(0, 10),
  page: "design system (production build, local preview server)",
  note: "Phone-sized window, CPU slowed 4x, no network slowdown (files come from this laptop). Budget: LCP < 2500 ms, CLS < 0.1.",
  ...metrics,
};
await writeFile(join(OUT, "load_metrics.json"), JSON.stringify(result, null, 2));
console.log(result);

await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (errors.length) {
  console.error("Page errors:\n" + [...new Set(errors)].join("\n"));
  process.exit(1);
}
