// The network half of in-browser mapping (pipeline.ts has the pure steps). It runs inside a Web Worker (worker.ts),
// so downloading and decoding pictures and running the model never freeze the page.
//   1. search Microsoft Planetary Computer's STAC catalogue for clear Sentinel-2 scenes covering the box
//   2. get a free read token, then read only the box's pixel blocks from each scene (Cloud-Optimised GeoTIFFs,
//      HTTP range requests: a few MB per scene instead of the whole ~200 MB picture)
//   3. median composite -> calibrated EuroSAT-style RGB -> 64 x 64 squares
//   4. run the fine-tuned EfficientNet-B0 (ONNX, seed 42) with ONNX Runtime Web: WebGPU if the browser has it,
//      else WebAssembly. The 16 MB model is checked against its SHA-256 and kept in the browser cache.
import { fromUrl } from "geotiff";
import * as ort from "onnxruntime-web";
import {
  boxKm, coversBox, cutPatches, medianComposite, needsOffsetFix, patchOutline, pickScenes, pixelWindow, preprocess,
  sceneValues, topClass, touchesBox, transformBounds, valuesToRgb, type Bbox, type Item, type LiveConfig,
} from "./pipeline";

export type Stage = "search" | "model-download" | "pictures" | "model" | "done";
export type Progress = { stage: Stage; year?: string; done?: number; total?: number; note?: string };

export type YearInfo = { window: string; n_scenes: number; first_date: string; last_date: string; scenes: string[]; offset_fixed: number };
export type LiveResult = {
  bbox: Bbox; tile: string; epsg: number; years: string[];
  info: Record<string, YearInfo>;
  overlay_corners: [number, number][];
  km2_per_patch: number; n_patches: number; n_patches_touching_finetune_area: number;
  areas_km2: Record<string, Record<string, number>>;
  mean_confidence: Record<string, number>;
  changes: { from: string; to: string; patches: number; km2: number }[]; // only with two years
  n_changed: number;
  patches_geojson: { type: "FeatureCollection"; features: unknown[] };
  rgb: Record<string, string>; // object URLs (webp)
  geotiff: Record<string, string>; // object URLs
  backend: string;
  timings_ms: { search: number; pictures: number; model: number; total: number };
  bytes_read: number;
};

export class BoxError extends Error {}

const CACHE = "terrascan-model-v1";

async function searchAll(cfg: LiveConfig, bbox: Bbox, window: string, signal: AbortSignal): Promise<Item[]> {
  let body: Record<string, unknown> | null = {
    collections: [cfg.collection], bbox, datetime: window, query: { "eo:cloud_cover": { lt: cfg.max_cloud } }, limit: 100,
  };
  let url = `${cfg.stac_url}/search`;
  const items: Item[] = [];
  while (body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`The satellite catalogue answered with an error (${res.status}).`);
    const page = await res.json() as { features: Item[]; links?: { rel: string; href: string; body?: Record<string, unknown> }[] };
    items.push(...page.features);
    const next = page.links?.find((l) => l.rel === "next");
    body = next?.body ?? null;
    if (next) url = next.href;
  }
  // src/imagery.py search_scenes: only scenes that cover the whole box, lowest cloud first (stable sort).
  return items.filter((it) => coversBox(it.geometry, bbox)).sort((a, b) => a.properties["eo:cloud_cover"] - b.properties["eo:cloud_cover"]);
}

async function loadModel(cfg: LiveConfig, onProgress: (p: Progress) => void): Promise<{ session: ort.InferenceSession; backend: string }> {
  let buf: ArrayBuffer | null = null;
  const cache = typeof caches !== "undefined" ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(cfg.model.url);
  if (hit) buf = await hit.arrayBuffer();
  else {
    onProgress({ stage: "model-download", done: 0, total: 1 });
    const res = await fetch(cfg.model.url);
    if (!res.ok || !res.body) throw new Error(`Could not download the model (${res.status}).`);
    const total = Number(res.headers.get("Content-Length")) || 16e6;
    const reader = res.body.getReader(), parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length;
      onProgress({ stage: "model-download", done: got, total });
    }
    const all = new Uint8Array(got);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    buf = all.buffer;
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hash !== cfg.model.sha256) { await cache?.delete(cfg.model.url); throw new Error("The downloaded model did not match its checksum. Please try again."); }
  if (!hit) await cache?.put(cfg.model.url, new Response(buf)).catch(() => undefined);
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  for (const ep of gpu ? ["webgpu", "wasm"] : ["wasm"]) {
    try { return { session: await ort.InferenceSession.create(buf, { executionProviders: [ep] }), backend: ep }; }
    catch (e) { if (ep === "wasm") throw e; }
  }
  throw new Error("unreachable");
}

type Read = { item: Item; values: Int32Array; has: Uint8Array; origin: [number, number]; res: number; win: ReturnType<typeof pixelWindow> };

async function readScene(cfg: LiveConfig, item: Item, bbox: Bbox, epsg: number, token: string, signal: AbortSignal, count: (n: number) => void): Promise<Read> {
  let origin: [number, number] = [0, 0], res = 10, win = { col: 0, row: 0, width: 0, height: 0 };
  const bands = await Promise.all(cfg.bands.map(async (b) => {
    // blockSize: fetch in 128 KB blocks so the many small header reads merge (120 -> 45 requests for one year;
    // measured with scripts/count-reads.mjs; bigger blocks were slower).
    const tif = await fromUrl(`${item.assets[b].href}?${token}`, { allowFullFile: false, blockSize: 131072 }, signal);
    const img = await tif.getImage();
    origin = img.getOrigin().slice(0, 2) as [number, number];
    res = img.getResolution()[0];
    win = pixelWindow(transformBounds(epsg, bbox), origin, res);
    const r = await img.readRasters({ window: [win.col, win.row, win.col + win.width, win.row + win.height], samples: [0], signal });
    const data = r[0] as Uint16Array;
    count(data.byteLength);
    return data;
  }));
  const { values, has } = sceneValues(bands, needsOffsetFix(item, cfg.offset_from_baseline), cfg.offset);
  return { item, values, has, origin, res, win };
}

async function toUrl(blob: Blob) { return URL.createObjectURL(blob); }

async function rgbImage(rgb: Uint8Array, width: number, h: number, w: number): Promise<string> {
  const data = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * width + x) * 3, d = (y * w + x) * 4;
    data.data[d] = rgb[s]; data.data[d + 1] = rgb[s + 1]; data.data[d + 2] = rgb[s + 2]; data.data[d + 3] = 255;
  }
  const full = new OffscreenCanvas(w, h);
  full.getContext("2d")!.putImageData(data, 0, 0);
  // Half size, like the API (rgb_downscale: 2): the squares carry the detail, the picture is the backdrop.
  const half = new OffscreenCanvas(Math.ceil(w / 2), Math.ceil(h / 2));
  const ctx = half.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, half.width, half.height);
  return toUrl(await half.convertToBlob({ type: "image/webp", quality: 0.8 }));
}

async function classTiff(grid: Uint8Array, rows: number, cols: number, origin: [number, number], res: number, epsg: number): Promise<string> {
  const { writeArrayBuffer } = await import("geotiff");
  // One pixel per square (640 m), value = class number in model.classes order, 255 = no square (src/showcase.py).
  const buf = writeArrayBuffer(grid, {
    width: cols, height: rows, BitsPerSample: [8], SampleFormat: [1], GDAL_NODATA: "255",
    ModelPixelScale: [res, res, 0], ModelTiepoint: [0, 0, 0, origin[0], origin[1], 0],
    GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: epsg,
  } as unknown as Parameters<typeof writeArrayBuffer>[1]);
  return toUrl(new Blob([buf], { type: "image/tiff" }));
}

// Map one box for one or two years. Two years must land on the same pixel grid (same tile) to compare squares.
export async function mapBox(cfg: LiveConfig, bbox: Bbox, years: string[], onProgress: (p: Progress) => void, signal: AbortSignal): Promise<LiveResult> {
  const t0 = performance.now();
  const [wk, hk] = boxKm(bbox);
  if (wk > cfg.max_side_km || hk > cfg.max_side_km) throw new BoxError(`The box is ${wk.toFixed(1)} × ${hk.toFixed(1)} km. Please draw at most ${cfg.max_side_km} × ${cfg.max_side_km} km.`);
  const size = cfg.patch_size;
  if (wk < size / 100 || hk < size / 100) throw new BoxError(`The box must be at least ${size / 100} × ${size / 100} km (one square).`);

  // Start the model download at once; it overlaps with the picture downloads.
  const model = loadModel(cfg, onProgress);
  model.catch(() => undefined);

  onProgress({ stage: "search" });
  const tokenP = fetch(cfg.token_url, { signal }).then((r) => { if (!r.ok) throw new Error("Could not get a read token for the pictures."); return r.json() as Promise<{ token: string }>; });
  const found = await Promise.all(years.map((y) => searchAll(cfg, bbox, cfg.years[y], signal)));
  let tile = "";
  const picked = years.map((y, k) => {
    const p = pickScenes(found[k], cfg.max_scenes, tile || undefined);
    if (!p) throw new BoxError(k > 0 && tile
      ? `No clear picture from ${y} lies on the same satellite tile (${tile}) as ${years[0]}, so the two years can't be compared square by square. Try a box a little to the side.`
      : `No clear Sentinel-2 picture covers this whole box in ${cfg.years[y]}. Try a box a little to the side.`);
    tile = p.tile;
    return p;
  });
  const { token } = await tokenP;
  const tSearch = performance.now();

  const epsgOf = (it: Item) => Number(String(it.properties["proj:code"] ?? `EPSG:${it.properties["proj:epsg"]}`).replace("EPSG:", ""));
  const epsg = epsgOf(picked[0].scenes[0]);
  const all = picked.flatMap((p) => p.scenes);
  let done = 0, bytes = 0;
  onProgress({ stage: "pictures", done, total: all.length });
  // A picture server sometimes refuses one request out of many; try each scene up to 3 times before giving up.
  const readRetry = async (it: Item): Promise<Read> => {
    for (let k = 0; ; k++) {
      try { return await readScene(cfg, it, bbox, epsg, token, signal, (n) => { bytes += n; }); }
      catch (e) { if (signal.aborted || k === 2) throw e; await new Promise((r) => setTimeout(r, 500 * (k + 1))); }
    }
  };
  const reads = await Promise.all(all.map((it) => readRetry(it).then((r) => { onProgress({ stage: "pictures", done: ++done, total: all.length }); return r; })));
  // src/composite.py check_same_grid: every scene must give the same window on the same grid.
  const g0 = reads[0];
  for (const r of reads) {
    if (epsgOf(r.item) !== epsg || r.origin[0] !== g0.origin[0] || r.origin[1] !== g0.origin[1] || JSON.stringify(r.win) !== JSON.stringify(g0.win)) throw new BoxError("The pictures are not on the same pixel grid. Try a box a little to the side.");
  }
  const tPics = performance.now();

  const { width, height } = g0.win;
  const origin: [number, number] = [g0.origin[0] + g0.win.col * g0.res, g0.origin[1] - g0.win.row * g0.res];
  const res = g0.res;
  const perYear = years.map((_, k) => {
    const rs = reads.filter((r) => picked[k].scenes.includes(r.item));
    const comp = medianComposite(rs);
    return { rgb: valuesToRgb(comp.values, cfg.calibration, cfg.scale_max), has: comp.has };
  });
  // Squares with no missing pixel in every year (one year: that year's squares).
  const both = new Uint8Array(width * height);
  for (let i = 0; i < both.length; i++) both[i] = perYear.every((p) => p.has[i]) ? 1 : 0;
  const at = cutPatches(both, height, width, size);
  if (!at.length) throw new BoxError("The pictures have gaps everywhere in this box. Try a box a little to the side.");

  const { session, backend } = await model;
  const classes = cfg.model.classes, nC = classes.length, S = cfg.model.image_size;
  const preds = [] as { cls: Int32Array; conf: Float32Array }[];
  const batch = 32, total = at.length * years.length;
  let ran = 0;
  for (const p of perYear) {
    const cls = new Int32Array(at.length), conf = new Float32Array(at.length);
    for (let s = 0; s < at.length; s += batch) {
      if (signal.aborted) throw signal.reason;
      const part = at.slice(s, s + batch);
      const x = new ort.Tensor("float32", preprocess(p.rgb, width, part, size, cfg.model), [part.length, 3, S, S]);
      const out = await session.run({ [session.inputNames[0]]: x });
      const top = topClass(out[session.outputNames[0]].data as Float32Array, nC);
      cls.set(top.cls, s); conf.set(top.conf, s);
      ran += part.length;
      onProgress({ stage: "model", done: ran, total });
    }
    preds.push({ cls, conf });
  }
  const tModel = performance.now();

  // ---------- Build the answer (same fields as src/live.py map_box, extended to two years) ----------
  const km2 = (res * res * size * size) / 1e6;
  const outlines = at.map(([r, c]) => patchOutline(epsg, origin, res, r, c, size));
  const features = at.map(([, ], i) => {
    const props: Record<string, unknown> = { id: i };
    years.forEach((y, k) => { props[`class_${y}`] = classes[preds[k].cls[i]]; props[`confidence_${y}`] = Math.round(preds[k].conf[i] * 1000) / 1000; });
    if (years.length === 2) props.changed = preds[0].cls[i] !== preds[1].cls[i];
    return { type: "Feature", id: i, properties: props, geometry: { type: "Polygon", coordinates: [[...outlines[i], outlines[i][0]]] } };
  });
  const rows = Math.floor(height / size), cols = Math.floor(width / size);
  const areas: LiveResult["areas_km2"] = {}, meanConf: LiveResult["mean_confidence"] = {}, rgb: LiveResult["rgb"] = {}, tiff: LiveResult["geotiff"] = {};
  for (const [k, y] of years.entries()) {
    const counts = new Array(nC).fill(0);
    preds[k].cls.forEach((c) => counts[c]++);
    areas[y] = Object.fromEntries(classes.map((c, i) => [c, Math.round(counts[i] * km2 * 1e4) / 1e4]));
    meanConf[y] = Math.round((preds[k].conf.reduce((a, b) => a + b, 0) / at.length) * 1e4) / 1e4;
    rgb[y] = await rgbImage(perYear[k].rgb, width, rows * size, cols * size);
    const grid = new Uint8Array(rows * cols).fill(255);
    at.forEach(([r, c], i) => { grid[(r / size) * cols + c / size] = preds[k].cls[i]; });
    tiff[y] = await classTiff(grid, rows, cols, origin, res * size, epsg);
  }
  const changes: LiveResult["changes"] = [];
  let nChanged = 0;
  if (years.length === 2) {
    const m = new Map<string, number>();
    for (let i = 0; i < at.length; i++) {
      if (preds[0].cls[i] === preds[1].cls[i]) continue;
      nChanged++;
      const key = `${classes[preds[0].cls[i]]}>${classes[preds[1].cls[i]]}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    for (const [key, n] of m) { const [from, to] = key.split(">"); changes.push({ from, to, patches: n, km2: Math.round(n * km2 * 1e4) / 1e4 }); }
    changes.sort((a, b) => b.patches - a.patches);
  }
  const info: LiveResult["info"] = {};
  years.forEach((y, k) => {
    const sc = picked[k].scenes;
    info[y] = { window: cfg.years[y], n_scenes: sc.length, first_date: sc[0].properties.datetime.slice(0, 10), last_date: sc[sc.length - 1].properties.datetime.slice(0, 10), scenes: sc.map((s) => s.id), offset_fixed: sc.filter((s) => needsOffsetFix(s, cfg.offset_from_baseline)).length };
  });
  const corner = (r: number, c: number) => patchOutline(epsg, origin, res, r, c, 0)[0];
  onProgress({ stage: "done" });
  return {
    bbox, tile, epsg, years, info,
    overlay_corners: [corner(0, 0), corner(0, cols * size), corner(rows * size, cols * size), corner(rows * size, 0)],
    km2_per_patch: Math.round(km2 * 1e6) / 1e6, n_patches: at.length,
    n_patches_touching_finetune_area: outlines.filter((o) => cfg.finetune_boxes.some((b) => touchesBox(o, b))).length,
    areas_km2: areas, mean_confidence: meanConf, changes, n_changed: nChanged,
    patches_geojson: { type: "FeatureCollection", features },
    rgb, geotiff: tiff, backend,
    timings_ms: { search: Math.round(tSearch - t0), pictures: Math.round(tPics - tSearch), model: Math.round(tModel - tPics), total: Math.round(performance.now() - t0) },
    bytes_read: bytes,
  };
}
