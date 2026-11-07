// Talking to the TerraScan API (api/main.py) for "Map your own area". Everything here is plain functions so the
// tests can call them with a fake fetch (tests never use the network).
//
// Where the API lives: set VITE_API_URL when building (e.g. the Hugging Face Space address, step 6.2). While
// developing it defaults to a local server (uvicorn api.main:default_app --factory --port 8000). A build with no
// address has no live mapping, and the site says so instead of showing a button that cannot work.
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

export type Bbox = [number, number, number, number]; // west, south, east, north (degrees)

// GET /health
export type Health = { status: string; years: string[]; max_side_km: number; timeout_s: number };

// POST /predict: the part of the answer the website uses (the full format is src/live.py map_box).
export type LiveMap = {
  bbox: Bbox;
  tile: string;
  years: Record<string, { window: string; n_scenes: number; first_date: string; last_date: string }>;
  scene_note: string;
  overlay_corners: [number, number][];
  km2_per_patch: number;
  n_patches: number;
  n_patches_touching_finetune_area: number;
  areas_km2: Record<string, Record<string, number>>;
  mean_confidence: Record<string, number>;
  patches_geojson: { type: "FeatureCollection"; features: unknown[] }; // one polygon per square: id, class_<year>, confidence_<year>
  files: { overlay: Record<string, string>; rgb: Record<string, string>; geotiff: Record<string, string> };
};

// An error with a message written for the person using the site.
export class ApiError extends Error {
  constructor(message: string, readonly kind: "unreachable" | "server" | "timeout") { super(message); }
}

const KM_PER_DEGREE = 111.32; // same number as src/live.py

// Width and height of a box in km (same formula as src/live.py box_size_km, close enough for a 10 km limit).
export function boxKm([west, south, east, north]: Bbox): [number, number] {
  const middle = ((south + north) / 2) * (Math.PI / 180);
  return [(east - west) * KM_PER_DEGREE * Math.cos(middle), (north - south) * KM_PER_DEGREE];
}

// The checks the server makes first, done here too so a bad box is explained at once. null = fine.
export function boxProblem(bbox: Bbox, maxSideKm: number): string | null {
  const [w, h] = boxKm(bbox);
  if (w > maxSideKm || h > maxSideKm) return `This box is ${w.toFixed(1)} × ${h.toFixed(1)} km. The most we can map is ${maxSideKm} × ${maxSideKm} km: zoom in or draw a smaller box.`;
  const patchKm = 0.64; // one 64 × 64 pixel patch at 10 m
  if (w < patchKm || h < patchKm) return `This box is ${w.toFixed(2)} × ${h.toFixed(2)} km. It must be at least ${patchKm} × ${patchKm} km (one square).`;
  return null;
}

type Fetch = typeof fetch;

export async function getHealth(signal?: AbortSignal, fetchFn: Fetch = fetch): Promise<Health> {
  let res: Response;
  try { res = await fetchFn(`${API_URL}/health`, { signal }); }
  catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Could not reach the mapping server.", "unreachable");
  }
  if (!res.ok) throw new ApiError(`The mapping server answered with an error (${res.status}).`, "server");
  return res.json() as Promise<Health>;
}

export async function predictBox(bbox: Bbox, year: string, signal?: AbortSignal, fetchFn: Fetch = fetch): Promise<LiveMap> {
  let res: Response;
  try {
    res = await fetchFn(`${API_URL}/predict`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bbox, year }), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Could not reach the mapping server. Check your connection and try again.", "unreachable");
  }
  if (!res.ok) {
    // The API explains its own refusals in {"detail": "..."} (a box that is too big, a timeout, ...).
    let detail = "";
    try { const body = await res.json(); if (typeof body.detail === "string") detail = body.detail; } catch { /* no JSON body */ }
    throw new ApiError(detail || `The mapping server answered with an error (${res.status}).`, res.status === 504 ? "timeout" : "server");
  }
  return res.json() as Promise<LiveMap>;
}
