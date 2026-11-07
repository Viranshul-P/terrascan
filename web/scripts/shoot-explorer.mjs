// Screenshots of the Explorer (step 5.3b) into reports/design/5.3b/, from the production build. Needs the internet
// (globe tiles). Usage (from web/): npm run build && npm run shots:explorer
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "reports", "design", "5.3b");
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4318, strictPort: true } });
const url = "http://localhost:4318";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const JPG = { type: "jpeg", quality: 82 };

for (const vp of [{ name: "desktop", width: 1440, height: 900, scale: 1 }, { name: "phone", width: 390, height: 844, scale: 2 }]) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${vp.name}-${scheme}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.scale });
    page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
    const shot = (n) => page.screenshot({ path: join(OUT, `${n}-${tag}.jpg`), ...JPG });

    // A fresh visit: the globe opening (mid-flight), then where it lands (flat, looking straight down).
    await page.goto(`${url}/explorer`);
    await page.waitForTimeout(3200);
    await shot("opening-mid");
    await page.waitForFunction(() => !document.querySelector(".skip"), null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await shot("opening-end");

    // A shared link: opens straight on the city, flat.
    await page.goto(`${url}/explorer?city=ahmedabad&year=2026`);
    await page.waitForTimeout(4500);
    await shot("explorer");
    const box = await page.locator(".map").boundingBox();
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
    await page.waitForTimeout(1200);
    await shot("selected");

    // The 3D button, then (desktop) turning the map with a right-drag: the compass follows.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "3D" }).click();
    await page.waitForTimeout(900);
    if (vp.name === "desktop") {
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.35);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.35, { steps: 10 });
      await page.mouse.up({ button: "right" });
    }
    await page.waitForTimeout(1500);
    await shot("3d");
    await page.getByRole("button", { name: "Fit the city, flat and north up" }).click();
    await page.waitForTimeout(1500);
    if (vp.name === "desktop") {
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
      await page.waitForTimeout(400);
      await shot("hover");
      await page.keyboard.press("Escape");
      await page.keyboard.press("c");
      await page.waitForTimeout(3500);
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.4);
      await page.waitForTimeout(400);
      await shot("compare");
      await page.keyboard.press("c");
      await page.click(".chg >> nth=1");
      await page.waitForTimeout(1200);
      await shot("biggest-change");
      await page.click(".chg >> nth=1");
      await page.click(".leg >> nth=7");
      await page.waitForTimeout(900);
      await shot("filter");
      await page.click(".combo");
      await page.waitForTimeout(500);
      await shot("city-picker");
      await page.click(".opt >> text=Surat");
      await page.waitForTimeout(3500);
      await shot("city-switch");
      if (!(await page.locator(".combo").textContent()).includes("Surat")) errors.push(`${tag}: city switch did not reach Surat`);
    }
    await page.close();
  }
}

// Load metrics (shared link, so no opening animation): phone-sized window, CPU slowed 4x.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${url}/explorer?city=ahmedabad&year=2026`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => ({ lcp_ms: Math.round(window.__lcp), cls: +window.__cls.toFixed(3) }));
  const res = { made_by: "web/scripts/shoot-explorer.mjs", date: new Date().toISOString().slice(0, 10),
    note: "Explorer, production build on this laptop (local files, so no network delay), phone-sized window, CPU slowed 4x. Budget: LCP < 2500 ms, CLS < 0.1.", ...m };
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
