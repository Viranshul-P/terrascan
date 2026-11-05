// Screenshots of the step 5.3a design prototypes (desktop + phone) into reports/design/5.3a/.
// Usage (from web/): npm run shots:prototypes
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", ".."); // repo root, so prototypes can read results/
const OUT = join(ROOT, "reports", "design", "5.3a");
const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".csv": "text/csv", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/web/prototypes`;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 360, height: 780 },
];
const directions = process.argv.slice(2).length ? process.argv.slice(2) : ["a", "b"];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const dir of directions) {
  for (const vp of VIEWPORTS) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: scheme,
        deviceScaleFactor: vp.name === "phone" ? 2 : 1,
      });
      page.on("pageerror", (e) => errors.push(`${dir}/${vp.name}: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`${dir}/${vp.name}: ${m.text()}`));
      for (const name of ["index", "map"]) {
        await page.goto(`${base}/${dir}/${name}.html`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const file = join(OUT, `${dir}-${name}-${vp.name}-${scheme}.jpg`);
        await page.screenshot({ path: file, fullPage: name === "index", type: "jpeg", quality: 80 });
        console.log("saved", file);
      }
      await page.close();
    }
  }
}
await browser.close();
server.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
