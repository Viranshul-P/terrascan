// Motion helpers (ported from prototype E's motion.js). Rule: animate only transform/opacity, do the work inside
// requestAnimationFrame, and skip motion entirely when the visitor asks for reduced motion.
import { useEffect, useRef, useState } from "react";

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// A number that counts from `from` to `to` once `start` is true. With reduced motion it is `to` straight away.
export function useCountUp(to: number, { from = 0, ms = 1100, delay = 0, start = true } = {}) {
  const [value, setValue] = useState(() => (reducedMotion() ? to : from));
  useEffect(() => {
    if (reducedMotion()) { setValue(to); return; }
    if (!start) return;
    let raf = 0, t0 = 0;
    const step = (t: number) => {
      t0 ||= t + delay;
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      setValue(from + (to - from) * easeOut(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms, delay, start]);
  return value;
}

// True from the first time the element is on screen (true at once without IntersectionObserver).
export function useSeen<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return { ref, seen };
}

// Props for an element that rises in the first time it is on screen: <div {...reveal}>.
// data-reveal is only set when motion is allowed, so without motion the content simply shows.
export function useReveal<T extends HTMLElement>() {
  const { ref, seen } = useSeen<T>(0.2);
  const motion = !reducedMotion();
  return { ref, "data-reveal": motion ? (seen ? "in" : "hidden") : undefined };
}

// A soft light that follows the pointer (CSS reads --mx/--my) and an optional small 3D tilt in degrees.
// Only on devices with a real mouse, and never with reduced motion.
export function useSpotlight<T extends HTMLElement>(tilt = 0) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const mouse = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!el || !mouse || reducedMotion()) return;
    let rect: DOMRect | null = null, raf = 0, x = 0.5, y = 0.5;
    const paint = () => {
      raf = 0;
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      if (tilt) el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * tilt).toFixed(2)}deg) rotateY(${((x - 0.5) * tilt).toFixed(2)}deg) translateY(-4px)`;
    };
    const move = (e: PointerEvent) => {
      rect ||= el.getBoundingClientRect();
      x = (e.clientX - rect.left) / rect.width;
      y = (e.clientY - rect.top) / rect.height;
      raf ||= requestAnimationFrame(paint);
    };
    const leave = () => { rect = null; el.style.transform = ""; };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, [tilt]);
  return ref;
}
