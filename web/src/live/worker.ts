// The Web Worker that runs engine.ts mapBox off the page's main thread. Messages:
//   in:  { type: "run", cfg, bbox, years }   |   { type: "cancel" }
//   out: { type: "progress", p }  |  { type: "result", result }  |  { type: "error", message, box }
import { BoxError, mapBox } from "./engine";

let job: AbortController | null = null;

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "cancel") { job?.abort(); return; }
  if (m.type !== "run") return;
  job?.abort();
  const ctl = new AbortController();
  job = ctl;
  try {
    const result = await mapBox(m.cfg, m.bbox, m.years, (p) => self.postMessage({ type: "progress", p }), ctl.signal);
    if (!ctl.signal.aborted) self.postMessage({ type: "result", result });
  } catch (err) {
    if (ctl.signal.aborted) return;
    console.error(err);
    self.postMessage({ type: "error", message: (err as Error).message || String(err), box: err instanceof BoxError });
  }
};
