// Screenshots of prototype D (step 5.3a) into reports/design/5.3a/d/. Needs the internet (globe tiles).
// Usage (from web/): npm run shots:d -- [story] [explorer] [method] [--video]
import { createServer } from "node:http";
import { readFile, mkdir, rename } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "reports", "design", "5.3a", "d");
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".csv": "text/csv", ".geojson": "application/geo+json", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2",
  ".tif": "image/tiff", ".jpg": "image/jpeg",
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
const base = `http://127.0.0.1:${server.address().port}/web/prototypes/d`;

const args = process.argv.slice(2);
const want = (name) => !args.filter((a) => !a.startsWith("--")).length || args.includes(name);
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, scale: 1 },
  { name: "phone", width: 390, height: 844, scale: 2 },
];
const JPG = { type: "jpeg", quality: 82 };
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
};
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.jpg`), ...JPG });

for (const vp of VIEWPORTS) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${vp.name}-${scheme}`;
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.scale });
    watch(page, tag);

    if (want("story")) {
      await page.goto(`${base}/index.html`);
      await page.waitForTimeout(3500);
      await shot(page, `story-0-${tag}`);
      for (let i = 1; i <= 6; i++) {
        await page.evaluate((k) => document.getElementById(`c${k}`).scrollIntoView({ block: "center" }), i);
        await page.waitForTimeout(i === 1 || i === 5 || i === 6 ? 5200 : 3400);
        await shot(page, `story-${i}-${tag}`);
      }
      await page.evaluate(() => document.getElementById("cities").scrollIntoView({ block: "start" }));
      await page.waitForTimeout(900);
      await shot(page, `story-cities-${tag}`);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await shot(page, `story-footer-${tag}`);
      // The Cities menu (desktop only)
      if (vp.name === "desktop") {
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(600);
        await page.click("#citiesBtn");
        await page.waitForTimeout(900);
        await shot(page, `nav-cities-menu-${tag}`);
        await page.keyboard.press("Escape");
      }
    }

    if (want("explorer")) {
      await page.goto(`${base}/explorer.html?city=ahmedabad`);
      await page.waitForTimeout(5000);
      await shot(page, `explorer-${tag}`);
      // Select a square: click a point in the middle of the map area
      const box = await page.locator("#map").boundingBox();
      await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
      await page.waitForTimeout(1200);
      await shot(page, `explorer-selected-${tag}`);
      if (vp.name === "desktop") {
        await page.keyboard.press("c");
        await page.waitForTimeout(2500);
        await shot(page, `explorer-compare-${tag}`);
        await page.keyboard.press("c");
        await page.click("#ownBtn");
        await page.waitForTimeout(800);
        await shot(page, `explorer-own-${tag}`);
      }
    }

    if (want("method")) {
      await page.goto(`${base}/method.html`);
      await page.waitForTimeout(1500);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `method-${tag}.jpg`), fullPage: true, ...JPG });
    }
    console.log("saved", tag);
    await page.close();
  }
}

if (args.includes("--video")) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } });
    const page = await ctx.newPage();
    watch(page, `video-${scheme}`);
    await page.goto(`${base}/index.html`);
    await page.waitForTimeout(4000);
    for (let i = 1; i <= 6; i++) {
      await page.evaluate((k) => document.getElementById(`c${k}`).scrollIntoView({ block: "center", behavior: "smooth" }), i);
      await page.waitForTimeout(5000);
    }
    const video = page.video();
    await ctx.close();
    await rename(await video.path(), join(OUT, `story-${scheme}.webm`));
    console.log("saved video", scheme);
  }
}

await browser.close();
server.close();
if (errors.length) {
  console.error("Page errors:\n" + [...new Set(errors)].join("\n"));
  process.exit(1);
}
