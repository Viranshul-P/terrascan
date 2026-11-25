// The page's side of in-browser mapping: loads live.json once, starts the worker, and turns its messages into a promise.
import type { LiveResult, Progress } from "./engine";
import type { Bbox, LiveConfig } from "./pipeline";

let cfgP: Promise<LiveConfig> | null = null;
export const liveConfig = () => (cfgP ??= fetch("/data/live.json").then((r) => { if (!r.ok) throw new Error("Could not load live.json"); return r.json(); }));

let worker: Worker | null = null;
const getWorker = () => (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));

export class LiveError extends Error { constructor(message: string, readonly box: boolean) { super(message); } }

// Map a box for one or two years. `signal` cancels it (the worker stops its downloads).
export async function runLive(bbox: Bbox, years: string[], onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<LiveResult> {
  const cfg = await liveConfig();
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const stop = () => { w.postMessage({ type: "cancel" }); w.removeEventListener("message", on); reject(new DOMException("cancelled", "AbortError")); };
    const on = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.p);
      else {
        w.removeEventListener("message", on); signal?.removeEventListener("abort", stop);
        if (m.type === "result") resolve(m.result); else reject(new LiveError(m.message, m.box));
      }
    };
    w.addEventListener("message", on);
    signal?.addEventListener("abort", stop, { once: true });
    w.postMessage({ type: "run", cfg, bbox, years });
  });
}
