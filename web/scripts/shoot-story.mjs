// Screenshots of the Story page (step 5.3c: the chapters, then the sections under the map) into
// reports/design/5.3c/, from the production build, plus its load speed. Needs the internet (globe tiles). Usage (from web/): npm run build && npm run shots:story
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "reports", "design", process.argv[2] ?? "5.3c"); // npm run shots:story -- 5.3d
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4319, strictPort: true } });
const url = "http://localhost:4319/";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const JPG = { type: "jpeg", quality: 80 };

for (const vp of [{ name: "desktop", width: 1440, height: 900, scale: 1 }, { name: "phone", width: 390, height: 844, scale: 2 }]) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${vp.name}-${scheme}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.scale });
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    await page.goto(url);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: join(OUT, `hero-${tag}.jpg`), ...JPG });
    // Each chapter card in the middle of the screen, after the map has flown there.
    for (let k = 1; k <= 6; k++) {
      await page.evaluate((k) => { const el = document.getElementById(`c${k}`); scrollTo(0, el.offsetTop + el.offsetHeight / 2 - innerHeight / 2); }, k);
      await page.waitForTimeout(4200);
      await page.screenshot({ path: join(OUT, `chapter${k}-${tag}.jpg`), ...JPG });
    }
    // The sections under the map (part 2).
    const shotOf = async (sel, name) => {
      await page.locator(sel).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1600);
      await page.screenshot({ path: join(OUT, `${name}-${tag}.jpg`), ...JPG });
    };
    await shotOf("#models", "models");
    await page.getByRole("button", { name: "Speed" }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `models-speed-${tag}.jpg`), ...JPG });
    await shotOf("#game", "game");
    await page.locator(".g-opt").first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `game-answered-${tag}.jpg`), ...JPG });
    await shotOf("#cities", "cities");
    if (vp.name === "desktop") {
      await page.locator(".ccard").first().hover();
      await page.waitForTimeout(1300);
      await page.screenshot({ path: join(OUT, `cities-hover-${tag}.jpg`), ...JPG });
    }
    await shotOf("#how", "how");
    await shotOf(".foot", "footer");
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (sideways > 0) errors.push(`${tag}: the page scrolls sideways by ${sideways}px`);
    await page.close();
  }
}

// Load metrics: phone-sized window, CPU slowed 4x.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => ({ lcp_ms: Math.round(window.__lcp), cls: +window.__cls.toFixed(3) }));
  const res = { made_by: "web/scripts/shoot-story.mjs", date: new Date().toISOString().slice(0, 10),
    note: "Story page, production build on this laptop (local files, so no network delay), phone-sized window, CPU slowed 4x. Budget: LCP < 2500 ms, CLS < 0.1.", ...m };
  await writeFile(join(OUT, "load_metrics.json"), JSON.stringify(res, null, 2));
  console.log(res);
  await page.close();
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (errors.length) {
  console.error("Page errors:\n" + [...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log("saved to", OUT);
