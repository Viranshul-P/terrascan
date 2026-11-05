// Screenshots + a video of the step 5.3a merged prototype (direction C) into reports/design/5.3a/.
// It needs the internet (MapLibre's free demo tiles for the globe). Usage (from web/): npm run shots:c
import { createServer } from "node:http";
import { readFile, mkdir, rename } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "reports", "design", "5.3a");
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".csv": "text/csv", ".geojson": "application/geo+json", ".png": "image/png",
  ".webp": "image/webp", ".woff2": "font/woff2",
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
const base = `http://127.0.0.1:${server.address().port}/web/prototypes/c`;

const JPG = { type: "jpeg", quality: 80 };
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, scale: 1 },
  { name: "phone", width: 360, height: 780, scale: 2 },
];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
};
const introDone = (page) => page.waitForFunction(() => document.documentElement.dataset.introDone === "1", null, { timeout: 60000 });

async function scrollThrough(page) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= h; y += 300) {
    await page.evaluate((v) => scrollTo(0, v), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
}

for (const vp of VIEWPORTS) {
  for (const scheme of ["light", "dark"]) {
    const tag = `c/${vp.name}/${scheme}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.scale });
    watch(page, tag);
    await page.goto(`${base}/index.html`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `c-index-globe-${vp.name}-${scheme}.jpg`), ...JPG });
    await introDone(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `c-index-landed-${vp.name}-${scheme}.jpg`), ...JPG });
    await scrollThrough(page);
    // Full-page captures blank the WebGL map, so the story below the map is captured on its own.
    await page.locator(".wrap").screenshot({ path: join(OUT, `c-story-${vp.name}-${scheme}.jpg`), ...JPG });

    await page.goto(`${base}/map.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.mouse.move(vp.width * 0.62, vp.height * 0.35);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `c-map-${vp.name}-${scheme}.jpg`), ...JPG });
    console.log("saved", tag);
    await page.close();
  }
}

// Video of the opening (desktop): globe -> fly-in -> year change -> caption -> scroll.
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 }, colorScheme: scheme,
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  });
  const page = await ctx.newPage();
  watch(page, `video/${scheme}`);
  await page.goto(`${base}/index.html`);
  await introDone(page);
  await page.waitForTimeout(1200);
  await scrollThrough(page);
  const video = page.video();
  await ctx.close();
  await rename(await video.path(), join(OUT, `c-opening-${scheme}.webm`));
  console.log("saved video", scheme);
}

await browser.close();
server.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
