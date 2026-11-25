// "Map your own area" in the browser: the pure steps of src/live.py map_box, ported one function at a time so each
// can be tested without the network. Names in comments are the Python functions each one copies.
// The parts that need the network (search, reading pictures, the model) are in engine.ts.
import { toLonLat, toUtm } from "./utm";

export type Bbox = [number, number, number, number]; // west, south, east, north (degrees)

// web/public/data/live.json, written by scripts/web_live_config.py from configs/api.yaml.
export type LiveConfig = {
  stac_url: string; token_url: string; collection: string; bands: string[];
  offset: number; offset_from_baseline: [number, number];
  years: Record<string, string>; max_cloud: number; max_scenes: number; max_side_km: number;
  patch_size: number; scale_max: number;
  calibration: { gain: number[]; shift: number[] };
  model: { url: string; sha256: string; seed: number; image_size: number; mean: number[]; std: number[]; classes: string[] };
  colours: Record<string, string>;
  finetune_boxes: Bbox[];
  parity: { source: string; runs_compared: number; squares_compared: number; squares_same_class: number; class_agreement: number; all_same_scenes: boolean; max_centre_offset_m: number } | null;
};

// The parts of a STAC item we use.
export type Item = {
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown> & { datetime: string; "eo:cloud_cover": number; "s2:mgrs_tile": string; "s2:processing_baseline": string; "s2:generation_time": string };
  assets: Record<string, { href: string }>;
};

// ---------- Scenes ----------

// Does a (Multi)Polygon contain the whole box? (src/imagery.py search_scenes: shape(geometry).contains(box))
// shortcut: checks 4 corners and 4 edge midpoints, not every edge crossing; Sentinel-2 footprints are near-convex,
// upgrade to a full polygon test if a box ever slips through.
export function coversBox(geometry: Item["geometry"], [w, s, e, n]: Bbox): boolean {
  const polys = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as number[][][][];
  const inside = (x: number, y: number) => polys.some((rings) => {
    let c = false;
    const ring = rings[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  });
  const mx = (w + e) / 2, my = (s + n) / 2;
  return [[w, s], [e, s], [e, n], [w, n], [mx, s], [mx, n], [w, my], [e, my]].every(([x, y]) => inside(x, y));
}

// src/composite.py one_per_date: one scene per date, the newest processing; sorted by date.
export function onePerDate(items: Item[]): Item[] {
  const best = new Map<string, Item>();
  for (const it of items) {
    const d = it.properties.datetime.slice(0, 10);
    const old = best.get(d);
    if (!old || it.properties["s2:generation_time"] > old.properties["s2:generation_time"]) best.set(d, it);
  }
  return [...best.keys()].sort().map((d) => best.get(d)!);
}

// src/live.py pick_scenes: the tile with the most clear dates, and its max_scenes clearest scenes (sorted by date).
// `onlyTile` keeps a second year on the first year's tile, so both years share one pixel grid (change maps).
export function pickScenes(items: Item[], maxScenes: number, onlyTile?: string): { tile: string; scenes: Item[] } | null {
  const byTile = new Map<string, Item[]>();
  for (const it of items) {
    const t = it.properties["s2:mgrs_tile"];
    if (onlyTile && t !== onlyTile) continue;
    byTile.set(t, [...(byTile.get(t) ?? []), it]);
  }
  let tile = "";
  for (const t of [...byTile.keys()].sort()) if (!tile || onePerDate(byTile.get(t)!).length > onePerDate(byTile.get(tile)!).length) tile = t;
  if (!tile) return null;
  const clearest = [...onePerDate(byTile.get(tile)!)].sort((a, b) => a.properties["eo:cloud_cover"] - b.properties["eo:cloud_cover"]).slice(0, maxScenes);
  return { tile, scenes: clearest.sort((a, b) => (a.properties.datetime < b.properties.datetime ? -1 : 1)) };
}

// src/imagery.py needs_offset_fix: baseline 04.00 or higher stores every value +1000. Decided per scene.
export function needsOffsetFix(item: Item, from: [number, number]): boolean {
  const [maj, min] = item.properties["s2:processing_baseline"].split(".").map(Number);
  return maj > from[0] || (maj === from[0] && min >= from[1]);
}

// ---------- Pixel window ----------

// rasterio.warp.transform_bounds(EPSG:4326 -> UTM, densify_pts=21): project points along each edge, take min/max.
export function transformBounds(epsg: number, [w, s, e, n]: Bbox, densify = 21): [number, number, number, number] {
  const xs: number[] = [], ys: number[] = [];
  const add = (lon: number, lat: number) => { const [x, y] = toUtm(epsg, lon, lat); xs.push(x); ys.push(y); };
  for (let i = 0; i <= densify + 1; i++) {
    const t = i / (densify + 1);
    add(w + (e - w) * t, s); add(w + (e - w) * t, n); add(w, s + (n - s) * t); add(e, s + (n - s) * t);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// rasterio from_bounds(...).round_offsets().round_lengths(): offsets floor(v + 0.1), lengths floor(v + 0.5).
// origin = top-left corner of the picture in UTM metres, res = pixel size (10 m).
export type Window = { col: number; row: number; width: number; height: number };
export function pixelWindow([left, bottom, right, top]: [number, number, number, number], origin: [number, number], res: number): Window {
  return {
    col: Math.floor((left - origin[0]) / res + 0.1),
    row: Math.floor((origin[1] - top) / res + 0.1),
    width: Math.floor((right - left) / res + 0.5),
    height: Math.floor((top - bottom) / res + 0.5),
  };
}

// ---------- Pixels ----------

// One scene's box: offset-free values (H*W*3, interleaved red, green, blue) and the has-data mask (all 3 non-zero).
// (src/imagery.py read_box + remove_offset)
export function sceneValues(bands: ArrayLike<number>[], fix: boolean, offset: number): { values: Int32Array; has: Uint8Array } {
  const n = bands[0].length;
  const values = new Int32Array(n * 3), has = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let ok = 1;
    for (let b = 0; b < 3; b++) {
      const v = bands[b][i];
      if (v === 0) ok = 0;
      values[i * 3 + b] = fix ? Math.max(v - offset, 0) : v;
    }
    has[i] = ok;
  }
  return { values, has };
}

// src/composite.py median_composite: per-pixel median over the scenes that have data there (numpy nanmedian).
export function medianComposite(scenes: { values: Int32Array; has: Uint8Array }[]): { values: Float32Array; has: Uint8Array } {
  const n = scenes[0].has.length;
  const values = new Float32Array(n * 3), has = new Uint8Array(n), buf: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < 3; b++) {
      buf.length = 0;
      for (const sc of scenes) if (sc.has[i]) buf.push(sc.values[i * 3 + b]);
      if (!buf.length) continue;
      buf.sort((x, y) => x - y);
      const m = buf.length >> 1;
      values[i * 3 + b] = buf.length % 2 ? buf[m] : Math.fround((Math.fround(buf[m - 1]) + Math.fround(buf[m])) / 2);
      has[i] = 1;
    }
  }
  return { values, has };
}

// numpy rint: halves go to the even neighbour.
export const rint = (v: number) => { const f = Math.floor(v), d = v - f; return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f; };

// src/imagery.py values_to_rgb: calibration (gain * value + shift, never below 0), then the EuroSAT stretch
// 0..scale_max -> 1..255 (rounded, clipped).
export function valuesToRgb(values: Float32Array, cal: LiveConfig["calibration"], scaleMax: number): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const b = i % 3, c = Math.max(values[i] * cal.gain[b] + cal.shift[b], 0);
    out[i] = Math.min(255, Math.max(1, rint(1 + (c * 254) / scaleMax)));
  }
  return out;
}

// src/imagery.py cut_patches: top-left (row, col) of every full size x size patch with no missing pixel.
export function cutPatches(has: Uint8Array, height: number, width: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r + size <= height; r += size) {
    for (let c = 0; c + size <= width; c += size) {
      let ok = true;
      for (let y = r; ok && y < r + size; y++) for (let x = c; x < c + size; x++) if (!has[y * width + x]) { ok = false; break; }
      if (ok) out.push([r, c]);
    }
  }
  return out;
}

// src/onnx_predict.py resize_weights: torch bilinear, align_corners=False.
function resizeWeights(nIn: number, nOut: number) {
  const i0 = new Int32Array(nOut), i1 = new Int32Array(nOut), w = new Float32Array(nOut);
  for (let k = 0; k < nOut; k++) {
    const src = Math.max(((k + 0.5) * nIn) / nOut - 0.5, 0);
    i0[k] = Math.floor(src); i1[k] = Math.min(i0[k] + 1, nIn - 1); w[k] = src - i0[k];
  }
  return { i0, i1, w };
}

// src/onnx_predict.py preprocess: patches -> float32 (N, 3, S, S): 0-1, bilinear up to S, (x - mean) / std.
export function preprocess(rgb: Uint8Array, width: number, at: [number, number][], size: number, model: LiveConfig["model"]): Float32Array {
  const S = model.image_size, { i0, i1, w } = resizeWeights(size, S);
  const out = new Float32Array(at.length * 3 * S * S);
  at.forEach(([r, c], p) => {
    for (let ch = 0; ch < 3; ch++) {
      const px = (y: number, x: number) => rgb[((r + y) * width + (c + x)) * 3 + ch] / 255;
      const base = (p * 3 + ch) * S * S;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const top = px(i0[y], i0[x]) * (1 - w[x]) + px(i0[y], i1[x]) * w[x];
          const bot = px(i1[y], i0[x]) * (1 - w[x]) + px(i1[y], i1[x]) * w[x];
          out[base + y * S + x] = (top * (1 - w[y]) + bot * w[y] - model.mean[ch]) / model.std[ch];
        }
      }
    }
  });
  return out;
}

// Top class and its softmax probability for each row of logits.
export function topClass(logits: Float32Array, nClasses: number): { cls: Int32Array; conf: Float32Array } {
  const n = logits.length / nClasses, cls = new Int32Array(n), conf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const row = logits.subarray(i * nClasses, (i + 1) * nClasses);
    let best = 0, max = -Infinity;
    row.forEach((v, k) => { if (v > max) { max = v; best = k; } });
    let sum = 0;
    row.forEach((v) => { sum += Math.exp(v - max); });
    cls[i] = best; conf[i] = 1 / sum;
  }
  return { cls, conf };
}

// ---------- Squares on the map ----------

// Outline (lon/lat) of a patch with top-left pixel (row, col): src/showcase.py patch_table / to_lonlat.
export function patchOutline(epsg: number, origin: [number, number], res: number, row: number, col: number, size: number): [number, number][] {
  const corner = (r: number, c: number) => toLonLat(epsg, origin[0] + c * res, origin[1] - r * res).map((v) => Math.round(v * 1e6) / 1e6) as [number, number];
  return [corner(row, col), corner(row, col + size), corner(row + size, col + size), corner(row + size, col)];
}

export const touchesBox = (o: [number, number][], [w, s, e, n]: Bbox) => {
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  return Math.min(...xs) <= e && Math.max(...xs) >= w && Math.min(...ys) <= n && Math.max(...ys) >= s;
};

// Width and height of a box in km (src/live.py box_size_km).
export function boxKm([w, s, e, n]: Bbox): [number, number] {
  const mid = ((s + n) / 2) * (Math.PI / 180);
  return [(e - w) * 111.32 * Math.cos(mid), (n - s) * 111.32];
}
