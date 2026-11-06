// Loading one showcase city: its summary.json and its patches.csv (one row per 640 m square).
import { getJson } from "./data";
import type { City, Patch, Summary } from "./types";

export const DATA = "/data/";

// patches.csv -> Patch[]. Columns: row,col,lon,lat,class_<year>,confidence_<year>,...,changed,touches_finetune_area
export function parsePatches(text: string, years: string[]): Patch[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const keys = head.split(",");
  return lines.map((line) => {
    const v = Object.fromEntries(line.split(",").map((x, i) => [keys[i], x]));
    return {
      row: Number(v.row),
      col: Number(v.col),
      lon: Number(v.lon),
      lat: Number(v.lat),
      changed: v.changed === "True",
      cls: Object.fromEntries(years.map((y) => [y, v[`class_${y}`]])),
      conf: Object.fromEntries(years.map((y) => [y, Number(v[`confidence_${y}`])])),
    };
  });
}

export async function loadCity(id: string, years: string[]): Promise<City> {
  const base = `${DATA}${id}/`;
  const summary = await getJson<Summary>(`${base}summary.json`);
  const res = await fetch(base + summary.files.patches_csv);
  if (!res.ok) throw new Error(`Could not load ${base}${summary.files.patches_csv} (${res.status})`);
  return { id, base, summary, patches: parsePatches(await res.text(), years) };
}

// [[west, south], [east, north]] of the city's picture.
export function cityBounds(summary: Summary): [[number, number], [number, number]] {
  const lngs = summary.overlay_corners.map((p) => p[0]);
  const lats = summary.overlay_corners.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
