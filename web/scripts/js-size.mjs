// JavaScript size of the built site (run `npm run build` first). The performance budget (PLAN.md, 5.3a-5.3d) is
// at most 200 KB gzipped for the JavaScript a visitor downloads on first load (map tiles not counted).
// Usage (from web/): npm run size
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = join(import.meta.dirname, "..", "dist");
const html = await readFile(join(DIST, "index.html"), "utf8");
// Files the page loads straight away: the <script> and modulepreload links in index.html.
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const all = (await readdir(join(DIST, "assets"))).filter((f) => f.endsWith(".js")).map((f) => `assets/${f}`);
const kb = async (f) => gzipSync(await readFile(join(DIST, f))).length / 1024;
let total = 0;
for (const f of all) {
  const size = await kb(f);
  if (initial.includes(f)) total += size;
  console.log(`${size.toFixed(1).padStart(7)} KB gzip  ${f}${initial.includes(f) ? "  (first load)" : ""}`);
}
console.log(`First-load JavaScript: ${total.toFixed(1)} KB gzipped (budget 200 KB) -> ${total <= 200 ? "PASS" : "FAIL"}`);
