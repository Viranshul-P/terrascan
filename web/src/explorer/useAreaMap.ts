// The state of "Map your own area": draw a box, map it in the browser (src/live/), show the result. One small state
// machine in a hook, so the panel and the map only read it. The mapping itself runs in a Web Worker; the tests pass
// a fake `run` (no network, no model).
import { useCallback, useEffect, useRef, useState } from "react";
import { liveConfig, runLive } from "../live/client";
import type { LiveResult, Progress } from "../live/engine";
import { boxKm, type Bbox, type LiveConfig } from "../live/pipeline";

// off = tool closed, draw = waiting for the box, ready = box drawn, running = mapping, done = result on the map,
// error = something said no (a box we can't map, or the network).
export type Mode = "off" | "draw" | "ready" | "running" | "done" | "error";
export type Which = string; // a year, or "both" (two years: the change map)
export type Run = typeof runLive;

// The default box limit until live.json has loaded (it says the same).
const DEFAULT_MAX_KM = 6;

// The checks the engine makes first, done here too so a bad box is explained at once. null = fine.
export function boxProblem(bbox: Bbox, maxSideKm: number): string | null {
  const [w, h] = boxKm(bbox);
  if (w > maxSideKm || h > maxSideKm) return `This box is ${w.toFixed(1)} × ${h.toFixed(1)} km. The most your browser maps at once is ${maxSideKm} × ${maxSideKm} km: zoom in or draw a smaller box.`;
  if (w < 0.64 || h < 0.64) return `This box is ${w.toFixed(2)} × ${h.toFixed(2)} km. It must be at least 0.64 × 0.64 km (one square).`;
  return null;
}

export function useAreaMap(years: string[], run: Run = runLive) {
  const [mode, setMode] = useState<Mode>("off");
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [which, setWhich] = useState<Which>(years.length > 1 ? "both" : years[0]);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [shown, setShown] = useState(years[years.length - 1]); // the year drawn on the map
  const [progress, setProgress] = useState<Progress | null>(null);
  const [modelDl, setModelDl] = useState<Progress | null>(null); // the one-time model download, alongside the steps
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [maxKm, setMaxKm] = useState(DEFAULT_MAX_KM);
  const [parity, setParity] = useState<LiveConfig["parity"]>(null);
  const job = useRef<AbortController | null>(null);
  const timer = useRef(0);

  useEffect(() => () => { job.current?.abort(); clearInterval(timer.current); }, []);

  const open = useCallback(() => {
    setMode("draw"); setError(null);
    liveConfig().then((c) => { setMaxKm(c.max_side_km); setParity(c.parity); }).catch(() => undefined);
  }, []);
  const stop = () => { job.current?.abort(); clearInterval(timer.current); };
  const close = useCallback(() => { stop(); setMode("off"); setBbox(null); setResult(null); setError(null); setProgress(null); }, []);
  const draw = useCallback(() => { stop(); setMode("draw"); setBbox(null); setResult(null); setError(null); }, []);
  const setBox = useCallback((b: Bbox) => { setBbox(b); setResult(null); setError(null); setMode("ready"); }, []);

  const start = useCallback(async (w: Which = which) => {
    if (!bbox || boxProblem(bbox, maxKm)) return;
    stop();
    const ctl = new AbortController();
    job.current = ctl;
    setWhich(w); setResult(null); setError(null); setProgress(null); setModelDl(null); setElapsed(0); setMode("running");
    const t0 = Date.now();
    timer.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    try {
      const ys = w === "both" ? years : [w];
      const r = await run(bbox, ys, (p) => (p.stage === "model-download" ? setModelDl(p) : setProgress(p)), ctl.signal);
      if (ctl.signal.aborted) return;
      setResult(r); setShown(ys[ys.length - 1]); setMode("done");
    } catch (e) {
      if (ctl.signal.aborted) return; // cancelled by the person
      setError((e as Error).message || "Something went wrong while mapping. Please try again.");
      setMode("error");
    } finally { clearInterval(timer.current); }
  }, [bbox, which, maxKm, years, run]);

  const cancel = useCallback(() => { stop(); setMode(bbox ? "ready" : "draw"); }, [bbox]);

  return { mode, bbox, which, setWhich, result, shown, setShown, progress, modelDl, error, elapsed, maxKm, parity, open, close, draw, setBox, run: start, cancel };
}
