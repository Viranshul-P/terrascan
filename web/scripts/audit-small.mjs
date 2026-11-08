// Small-phone audit (step 5.3d): 360 px wide, both pages, light and dark. Checks: no sideways scroll, the header's two
// page links are visible and nothing in the header is cut off, no console errors, and that Tab lands on something with
// a visible focus outline. Photos go to reports/design/5.3d/audit/. Needs the internet (globe tiles).
// Usage (from web/): npm run build && node scripts/audit-small.mjs
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const OUT = join(resolve(import.meta.dirname, "..", ".."), "reports", "design", "5.3d", "audit");
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4324, strictPort: true } });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let failed = false;
const say = (ok, msg) => { if (!ok) failed = true; console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); };
for (const path of ["/", "/explorer"]) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${path === "/" ? "story" : "explorer"}-${scheme}`;
    const page = await browser.newPage({ viewport: { width: 360, height: 740 }, colorScheme: scheme, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://localhost:4324${path}`, { waitUntil: "networkidle" });
    await page.evaluate(() => scrollBy(0, 2)); // wakes the Story's map
    await page.waitForTimeout(path === "/" ? 6000 : 4000);
    const m = await page.evaluate(() => {
      const links = [...document.querySelectorAll(".site-links a")].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.textContent);
      const nav = document.querySelector(".site-nav").getBoundingClientRect();
      const cut = [...document.querySelectorAll(".site-nav a, .site-nav button")].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > nav.right + 0.5).length;
      return { sideways: document.documentElement.scrollWidth - innerWidth, links, cut };
    });
    say(m.sideways <= 0, `${tag}: no sideways scroll (${m.sideways} px)`);
    say(m.links.includes("Story") && m.links.includes("Explorer"), `${tag}: header links shown: ${m.links.join(", ")}`);
    say(m.cut === 0, `${tag}: nothing in the header is cut off`);
    await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    const f = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { tag: e.tagName, label: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30), outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== "none" }; });
    say(f.tag !== "BODY" && (f.outline || f.shadow), `${tag}: Tab reaches "${f.label}" with a visible focus ring`);
    say(errors.length === 0, `${tag}: no console errors${errors.length ? " -> " + [...new Set(errors)].join(" | ") : ""}`);
    await page.screenshot({ path: join(OUT, `${tag}.jpg`), type: "jpeg", quality: 82 });
    await page.close();
  }
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
process.exit(failed ? 1 : 0);
