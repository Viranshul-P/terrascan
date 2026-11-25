// How long until the Explorer's map is ready ("Loading the map…" gone), from the production build.
// Usage (from web/): npm run build && node scripts/time-explorer.mjs
import { resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4320, strictPort: true } });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const path of ["/explorer?city=ahmedabad&year=2026", "/explorer"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const t0 = Date.now();
  await page.goto(`http://localhost:4320${path}`);
  await page.waitForSelector(".map canvas");
  await page.waitForFunction(() => !document.querySelector(".map-loading"), null, { timeout: 60000 });
  console.log(path, `map ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.close();
}
await browser.close();
await server.close();
