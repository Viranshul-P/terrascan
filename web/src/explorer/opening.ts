// The Explorer's opening: the globe turns gently, then the camera flies down to the city and tilts into 3D.
// Any click, scroll, touch or key skips straight to the end. With reduced motion it starts at the end.
import type { Map as MlMap, CameraOptions, PaddingOptions } from "maplibre-gl";
import { reducedMotion } from "../lib/motion";

export const GLOBE: CameraOptions = { center: [62, 16], zoom: 1.6, pitch: 0, bearing: 0 };
const SPIN_MS = 1400; // globe turning before the flight
const FLY_MS = 4200;

export type EndCamera = CameraOptions & { padding: PaddingOptions };

// Starts the opening and returns a function that skips it. onDone runs once, when it ends or is skipped.
export function playOpening(map: MlMap, end: EndCamera, onDone: () => void) {
  let done = false, flying = false, raf = 0, timer = 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    onDone();
  };
  const skip = () => { if (done) return; map.stop(); map.jumpTo(end); finish(); };
  const listeners: [string, () => void][] = ["pointerdown", "wheel", "keydown", "touchstart"].map((t) => [t, skip]);

  if (reducedMotion()) { map.jumpTo(end); finish(); return skip; }
  for (const [type, fn] of listeners) window.addEventListener(type, fn, { capture: true, passive: true });

  // 1. The globe turns slowly eastward, towards India.
  const t0 = performance.now();
  const startLng = (map.getCenter().lng);
  const spin = (t: number) => {
    if (done || flying) return;
    map.setCenter([startLng + ((t - t0) / SPIN_MS) * 6, map.getCenter().lat]);
    if (t - t0 < SPIN_MS) raf = requestAnimationFrame(spin);
  };
  raf = requestAnimationFrame(spin);
  // 2. Then a long, smooth flight down to the city, ending tilted.
  // (The turning stops first: one more turning step after the flight starts would cancel the flight.)
  timer = window.setTimeout(() => {
    if (done) return;
    flying = true;
    cancelAnimationFrame(raf);
    map.flyTo({ ...end, duration: FLY_MS, curve: 1.35, essential: true });
    map.once("moveend", finish);
  }, SPIN_MS);
  return skip;
}
