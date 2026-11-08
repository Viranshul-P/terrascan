// Does the still globe sit where the live globe appears? (step 5.3d) Takes, per window size and colour scheme, a photo of
// the hero before the visitor does anything (still picture) and one after the live map is ready, into
// reports/design/5.3d/poster/, plus how many seconds before the map was asked for (nothing may be downloaded early).
// Needs the internet (globe tiles). Usage (from web/): npm run build && node scripts/check-poster.mjs
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const OUT = join(resolve(import.meta.dirname, "..", ".."), "reports", "design", "5.3d", "poster");
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4322, strictPort: true } });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const vp of [{ name: "desktop", width: 1440, height: 900, scale: 1 }, { name: "phone", width: 390, height: 844, scale: 2 }]) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.scale });
    const early = [];
    page.on("request", (r) => /TerraMap|gibs\.earthdata|rgb_20|patches\.geojson/.test(r.url()) && early.push(r.url().split("/").pop()));
    await page.goto("http://localhost:4322/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // longer than the old 1.6 s timer
    await page.screenshot({ path: join(OUT, `still-${vp.name}-${scheme}.jpg`), type: "jpeg", quality: 85 });
    console.log(`${vp.name}-${scheme}: map files asked for before any interaction: ${early.length ? early.join(", ") : "none"}`);
    if (vp.name === "desktop") await page.mouse.move(300, 300); else await page.evaluate(() => scrollBy(0, 2)); // a first small scroll
    await page.waitForSelector('.story-map[data-ready="true"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `live-${vp.name}-${scheme}.jpg`), type: "jpeg", quality: 85 });
    await page.close();
  }
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
