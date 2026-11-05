// Throwaway prototype helper (step 5.3a). Loads the real data files so no number is typed into a page.
// Serve the repo root (python -m http.server) and open /web/prototypes/<a|b>/index.html.

const DATA = "../../public/data/";
const RESULTS = "../../../results/";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

async function getPatches(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const [head, ...lines] = (await res.text()).trim().split("\n");
  const keys = head.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
  });
}

export async function loadCity(id) {
  const summary = await getJson(`${DATA}${id}/summary.json`);
  const patches = await getPatches(`${DATA}${id}/patches.csv`);
  return { id, summary, patches, base: `${DATA}${id}/` };
}

export async function loadAll(cityId = "ahmedabad") {
  const [index, check, india, city] = await Promise.all([
    getJson(`${DATA}index.json`),
    getJson(`${RESULTS}change_check.json`),
    getJson(`${RESULTS}india_after.json`),
    loadCity(cityId),
  ]);
  return { index, check, india: india.summary_mean_std_over_seeds, city };
}

// Plain-English class names for the 10 EuroSAT classes.
export const LABEL = {
  AnnualCrop: "Farmland",
  Forest: "Forest",
  HerbaceousVegetation: "Scrub and grass",
  Highway: "Roads",
  Industrial: "Industrial",
  Pasture: "Pasture",
  PermanentCrop: "Orchards",
  Residential: "Housing",
  River: "River",
  SeaLake: "Lake",
};

export const km2 = (v) => `${Math.round(v).toLocaleString("en-US")}`;
export const pct = (v, digits = 1) => `${(v * 100).toFixed(digits)}`;

// Row/col of the 640 m patch under a point given as 0–1 fractions of the image.
export function patchAt(city, fx, fy) {
  const { grid_rows: rows, grid_cols: cols } = city.summary;
  const row = Math.min(rows - 1, Math.max(0, Math.floor(fy * rows)));
  const col = Math.min(cols - 1, Math.max(0, Math.floor(fx * cols)));
  return city.patches[row * cols + col];
}

// Picks a few real changed patches (highest 2026 confidence) to annotate the plate.
// box = [x0, y0, x1, y1] as 0–1 fractions: only patches inside it (so marks stay inside a cropped view).
export function strongestChanges(city, from, to, n, minGap = 8, box = [0, 0, 1, 1]) {
  const { grid_cols: cols, grid_rows: rows } = city.summary;
  return city.patches
    .map((p, i) => ({ ...p, row: Math.floor(i / cols), col: i % cols }))
    .filter((p) => p.changed === "True" && p.class_2018 === from && p.class_2026 === to)
    .filter((p) => {
      const fx = (p.col + 0.5) / cols, fy = (p.row + 0.5) / rows;
      return fx >= box[0] && fy >= box[1] && fx <= box[2] && fy <= box[3];
    })
    .sort((a, b) => Number(b.confidence_2026) - Number(a.confidence_2026))
    .reduce((kept, p) => {
      const farEnough = kept.every((q) => Math.hypot(p.row - q.row, p.col - q.col) >= minGap);
      return farEnough && kept.length < n ? [...kept, p] : kept;
    }, [])
    .map((p) => ({ ...p, fx: (p.col + 0.5) / cols, fy: (p.row + 0.5) / rows }));
}

// Drag-to-compare: sets --split (0–100) on the element. Keyboard: arrow keys on the handle.
export function makeSwipe(el, handle, start = 50) {
  let split = start;
  const set = (v) => {
    split = Math.min(100, Math.max(0, v));
    el.style.setProperty("--split", `${split}%`);
    handle.setAttribute("aria-valuenow", String(Math.round(split)));
  };
  const fromEvent = (e) => {
    const r = el.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  handle.addEventListener("pointermove", (e) => {
    if (handle.hasPointerCapture(e.pointerId)) fromEvent(e);
  });
  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") set(split - 5);
    if (e.key === "ArrowRight") set(split + 5);
  });
  set(start);
}
