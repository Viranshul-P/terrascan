// Lighthouse (mobile, simulated slow 4G, CPU 4x slower) on the production build, run N times; saves the scores to
// reports/design/<step>/lighthouse.json. Needs the internet for npx (lighthouse@12.0.0 is not in package.json) and the
// globe tiles. Usage (from web/): npm run build && node scripts/lighthouse.mjs 5.3d [runs] [path]
// (On Git Bash, a path argument like / gets rewritten; leave it out for the front page.)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const step = process.argv[2] ?? "5.3d";
const runs = Number(process.argv[3] ?? 3);
const path = process.argv[4] ?? "/";
const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "reports", "design", step);
await mkdir(OUT, { recursive: true });
const server = await preview({ root: resolve(import.meta.dirname, ".."), preview: { port: 4320, strictPort: true } });
const url = `http://localhost:4320${path}`;
const chrome = chromium.executablePath();
const run = promisify(execFile); // not execFileSync: that would freeze the preview server Lighthouse is loading from
const results = [];
for (let i = 0; i < runs; i++) {
  const file = join(OUT, `lh-run${i + 1}.json`);
  await run("npx", ["-y", "lighthouse@12.0.0", url, "--only-categories=performance,accessibility,best-practices",
    "--chrome-flags=--headless=new", "--output=json", `--output-path=${file}`, "--quiet"],
  { env: { ...process.env, CHROME_PATH: chrome }, shell: true, timeout: 300000, maxBuffer: 1 << 26 });
  const r = JSON.parse(await readFile(file, "utf8"));
  const a = r.audits;
  results.push({
    fetched: r.fetchTime,
    scores: Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
    lcp_s: +(a["largest-contentful-paint"].numericValue / 1000).toFixed(2),
    tbt_ms: Math.round(a["total-blocking-time"].numericValue),
    cls: +a["cumulative-layout-shift"].numericValue.toFixed(3),
    fcp_s: +(a["first-contentful-paint"].numericValue / 1000).toFixed(2),
    failed: Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== "informative" && x.scoreDisplayMode !== "notApplicable").map((x) => `${x.id} (${x.score})`),
  });
}
await writeFile(join(OUT, "lighthouse.json"), JSON.stringify({ url, chrome: "Playwright Chromium", runs: results }, null, 2));
console.log(JSON.stringify(results, null, 1));
await server.close();
