// Makes the still picture of the hero globe (step 5.3d): web/public/globe-light.webp and globe-dark.webp.
// The page shows this picture straight away and loads the live 3D map only when the visitor first scrolls, touches or
// moves the mouse (so the map's JavaScript doesn't compete with the first paint).
// How: open the real page in a 1440x900 window, wait until the live map has settled, hide everything except the map,
// photograph a square around the globe, then Pillow (Python) fades the square's edge to transparent and saves WebP.
// Needs the internet (NASA globe tiles) and Python with Pillow. Usage (from web/): npm run build && node scripts/make-globe-poster.mjs
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const WEB = resolve(import.meta.dirname, "..");
const TMP = join(WEB, "node_modules", ".cache", "globe-poster");
await mkdir(TMP, { recursive: true });
const server = await preview({ root: WEB, preview: { port: 4321, strictPort: true } });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const W = 1440, H = 900;
const SIDE = 770; // photograph a square this wide around the globe (about 470 px wide on screen), so the sky glow is inside
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: theme });
  await page.goto("http://localhost:4321/");
  await page.mouse.move(300, 300); // wakes the map up (it loads on the first mouse move, scroll or touch)
  await page.waitForSelector('.story-map[data-ready="true"]', { timeout: 60000 });
  await page.waitForTimeout(2500); // fade-in and tiles
  await page.addStyleTag({ content: ".steps, .site-header, header, .rail, .scroll-cue, .progress { visibility: hidden !important; } .story-map::after { display: none !important; }" });
  const box = await page.locator(".story-map").boundingBox();
  // The hero keeps the globe in the part of the map right of the first 42% of the width (heroPad in pages/Story.tsx).
  const cx = box.x + (0.42 * box.width + box.width) / 2, cy = box.y + box.height / 2;
  const clip = { x: Math.round(cx - SIDE / 2), y: Math.round(cy - SIDE / 2), width: SIDE, height: SIDE };
  await page.screenshot({ path: join(TMP, `${theme}.png`), clip });
  console.log(theme, "photographed", SIDE, "px square");
  await page.close();
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
execFileSync("python", [join(import.meta.dirname, "globe_poster.py"), TMP, join(WEB, "public")], { stdio: "inherit" });
