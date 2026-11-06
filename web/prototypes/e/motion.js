// Small motion helpers for prototype E. Plain JS, no animation library.
// Rules: only transform/opacity are animated (cheap for the browser), work happens inside requestAnimationFrame,
// and every helper does nothing (or jumps to the end) when the visitor asks for reduced motion.
import { reducedMotion } from "./shell.js";

export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const hoverDevice = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

// Counts el's text from `from` to `to`. format(v) turns the number into text (so 319 -> "319", 0.51 -> "51").
export function countTo(el, to, { from = 0, ms = 1100, delay = 0, format = (v) => Math.round(v).toLocaleString("en-US") } = {}) {
  if (!el) return;
  if (reducedMotion()) { el.textContent = format(to); return; }
  // Lock the number's box to its final size first. Then each new value only re-lays out and repaints that small
  // box, not the whole card around it (unlocked count-ups doubled layout and paint work while the map was moving;
  // measured in step 5.3a). The lock is removed when the count is done.
  el.textContent = format(to);
  const { width, height } = el.getBoundingClientRect();
  const before = el.getAttribute("style");
  Object.assign(el.style, { display: "inline-block", width: `${Math.ceil(width)}px`, height: `${Math.ceil(height)}px`, overflow: "clip", contain: "layout paint", whiteSpace: "nowrap" });
  el.textContent = format(from);
  let t0 = 0, shown = format(from);
  const step = (t) => {
    t0 ||= t + delay;
    const k = Math.min(1, Math.max(0, (t - t0) / ms));
    const text = format(from + (to - from) * easeOut(k));
    if (text !== shown) el.textContent = shown = text; // only touch the page when the number really changes
    if (k < 1) requestAnimationFrame(step);
    else before === null ? el.removeAttribute("style") : el.setAttribute("style", before);
  };
  requestAnimationFrame(step);
}

// Calls fn(el) once, the first time el is on screen.
export function onceVisible(el, fn, threshold = 0.35) {
  if (!el) return;
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(el); }
  }, { threshold });
  io.observe(el);
}

// Wraps each word of el in <span class="w" style="--i:n"> so CSS can bring them in one after another.
// Inline elements (like <em>) count as one word and keep their styling.
export function splitWords(el) {
  let i = 0;
  const word = (content) => {
    const s = document.createElement("span");
    s.className = "w";
    s.style.setProperty("--i", i++);
    s.append(content);
    return s;
  };
  for (const node of [...el.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = node.textContent.split(/(\s+)/).filter(Boolean);
      node.replaceWith(...parts.map((p) => (/^\s+$/.test(p) ? document.createTextNode(p) : word(p))));
    } else {
      el.replaceChild(word(node.cloneNode(true)), node);
    }
  }
  el.classList.add("split");
}

// A soft light that follows the pointer (CSS reads --mx/--my), plus an optional small 3D tilt in degrees.
export function spotlight(el, { tilt = 0 } = {}) {
  if (reducedMotion() || !hoverDevice()) return;
  let rect = null, raf = 0, x = 0.5, y = 0.5;
  const paint = () => {
    raf = 0;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    if (tilt) el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * tilt).toFixed(2)}deg) rotateY(${((x - 0.5) * tilt).toFixed(2)}deg) translateY(-4px)`;
  };
  el.addEventListener("pointerenter", () => (rect = el.getBoundingClientRect()));
  el.addEventListener("pointermove", (e) => {
    rect ||= el.getBoundingClientRect();
    x = (e.clientX - rect.left) / rect.width;
    y = (e.clientY - rect.top) / rect.height;
    raf ||= requestAnimationFrame(paint);
  });
  el.addEventListener("pointerleave", () => { rect = null; el.style.transform = ""; });
}

// Swaps picture A for picture B on a canvas, one block at a time in a random order. The blocks are the model's
// 640 m squares (cols x rows), so the change appears square by square, the way the model sees it.
// a and b are images or canvases of the same size. Returns { to(0|1) } to animate towards A (0) or B (1).
export function pixelSwap(canvas, a, b, cols, rows, { ms = 700, seed = 1 } = {}) {
  // A plain CPU canvas: for these small pictures it is fast, and it skips the GPU canvas set-up, which froze one
  // frame for ~330 ms the first time a canvas appeared mid-scroll (measured in step 5.3a).
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const W = a.width, H = a.height;
  canvas.width = W; canvas.height = H;
  ctx.drawImage(a, 0, 0);
  // Fixed-seed shuffle so a card always dissolves the same way.
  const order = [...Array(cols * rows).keys()];
  let s = seed;
  for (let i = order.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const block = (k, img) => {
    const c = order[k] % cols, r = Math.floor(order[k] / cols);
    const x0 = Math.floor((c * W) / cols), x1 = Math.floor(((c + 1) * W) / cols);
    const y0 = Math.floor((r * H) / rows), y1 = Math.floor(((r + 1) * H) / rows);
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  };
  let shown = 0, target = 0, raf = 0, last = 0; // shown = how many blocks currently show B
  const total = order.length;
  const tick = (t) => {
    const dt = last ? t - last : 16;
    last = t;
    const stepN = Math.max(1, Math.round((total * dt) / ms));
    if (shown < target) { const n = Math.min(target, shown + stepN); for (let k = shown; k < n; k++) block(k, b); shown = n; }
    else if (shown > target) { const n = Math.max(target, shown - stepN); for (let k = shown - 1; k >= n; k--) block(k, a); shown = n; }
    raf = shown === target ? 0 : requestAnimationFrame(tick);
  };
  return {
    to(v) {
      target = v ? total : 0;
      if (reducedMotion()) { ctx.drawImage(v ? b : a, 0, 0); shown = target; return; }
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    },
  };
}

// Loads an image for drawing on a canvas. createImageBitmap prepares it in the background, so the first draw is
// cheap (with a plain <img> the first draw took 66 ms on an idle page, 16 ms with a bitmap; tested in step 5.3a).
export async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return createImageBitmap(await res.blob());
}
