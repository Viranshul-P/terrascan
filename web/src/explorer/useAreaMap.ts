// The state of "Map your own area": draw a box, run it, show the result. One small state machine in a hook, so the
// panel and the map only read it. It talks to the API through lib/api.ts (the tests pass a fake fetch).
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, boxProblem, getHealth, predictBox, type Bbox, type Health, type LiveMap } from "../lib/api";

// off = tool closed, draw = waiting for the box, ready = box drawn, running = waiting for the server,
// done = result on the map, error = the server (or the network) said no.
export type Mode = "off" | "draw" | "ready" | "running" | "done" | "error";
// Is the server awake? A free server sleeps when nobody uses it, so the first answer can be slow.
//   none = this build has no API address, unknown = not asked yet, checking = asked (fast so far),
//   waking = no answer after WAKING_AFTER_MS, awake = it answered, off = could not be reached.
export type Server = "none" | "unknown" | "checking" | "waking" | "awake" | "off";

export const WAKING_AFTER_MS = 3000;
// Used until /health tells us the real limits.
const DEFAULT_LIMITS = { max_side_km: 10, timeout_s: 60 };

export type Fetch = typeof fetch;

export function useAreaMap(years: string[], fetchFn: Fetch = (...a) => fetch(...a)) {
  const [mode, setMode] = useState<Mode>("off");
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [year, setYear] = useState(years[years.length - 1]);
  const [result, setResult] = useState<{ map: LiveMap; year: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<Server>(API_URL ? "unknown" : "none");
  const [health, setHealth] = useState<Health | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const job = useRef<AbortController | null>(null);
  const pingJob = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);
  const limits = health ?? DEFAULT_LIMITS;

  const clearTimers = () => { timers.current.forEach((t) => clearTimeout(t)); timers.current.forEach((t) => clearInterval(t)); timers.current = []; };
  useEffect(() => () => { job.current?.abort(); pingJob.current?.abort(); clearTimers(); }, []);

  // Ask the server if it is awake (called when the tool opens). If it takes more than 3 s we say it is waking up.
  const ping = useCallback(() => {
    if (!API_URL) { setServer("none"); return; }
    pingJob.current?.abort();
    const ctl = new AbortController();
    pingJob.current = ctl;
    setServer("checking");
    const slow = window.setTimeout(() => setServer((s) => (s === "checking" ? "waking" : s)), WAKING_AFTER_MS);
    getHealth(ctl.signal, fetchFn)
      .then((h) => { setHealth(h); setServer("awake"); })
      .catch((e: Error) => { if (e.name !== "AbortError") setServer("off"); })
      .finally(() => clearTimeout(slow));
  }, [fetchFn]);

  const open = useCallback(() => { setMode("draw"); setError(null); if (server === "unknown" || server === "off") ping(); }, [ping, server]);
  const close = useCallback(() => {
    job.current?.abort(); pingJob.current?.abort(); clearTimers();
    setMode("off"); setBbox(null); setResult(null); setError(null);
  }, []);
  const draw = useCallback(() => { job.current?.abort(); clearTimers(); setMode("draw"); setBbox(null); setResult(null); setError(null); }, []);
  const setBox = useCallback((b: Bbox) => { setBbox(b); setResult(null); setError(null); setMode("ready"); }, []);

  const run = useCallback(async (yr: string = year) => {
    if (!bbox || boxProblem(bbox, limits.max_side_km)) return;
    job.current?.abort();
    const ctl = new AbortController();
    job.current = ctl;
    setYear(yr); setResult(null); setError(null); setElapsed(0); setMode("running");
    const t0 = Date.now();
    clearTimers();
    timers.current.push(window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000));
    // Stop waiting a little after the server's own limit, so a server that never answers does not hang the page.
    timers.current.push(window.setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), (limits.timeout_s + 15) * 1000));
    try {
      // Race the request against the abort signal, so Cancel and the time limit work even if fetch is slow to react.
      const stopped = new Promise<never>((_, reject) => ctl.signal.addEventListener("abort", () => reject(ctl.signal.reason)));
      const map = await Promise.race([predictBox(bbox, yr, ctl.signal, fetchFn), stopped]);
      setResult({ map, year: yr }); setServer("awake"); setMode("done");
    } catch (e) {
      if (ctl.signal.aborted && (ctl.signal.reason as Error | undefined)?.name !== "TimeoutError") return; // cancelled by the person
      setError(ctl.signal.aborted ? `The server did not answer within ${limits.timeout_s + 15} seconds. Please try again, or draw a smaller box.` : (e as Error).message);
      setMode("error");
    } finally { clearTimers(); }
  }, [bbox, year, limits, fetchFn]);

  // Stop waiting. (The server may still finish in the background; it cannot be told to stop.)
  const cancel = useCallback(() => { job.current?.abort(); clearTimers(); setMode(bbox ? "ready" : "draw"); }, [bbox]);

  return { mode, bbox, year, setYear, result, error, server, limits, elapsed, open, close, draw, setBox, run, cancel, ping };
}
