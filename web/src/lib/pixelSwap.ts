// Swapping one picture for another on a canvas, one block at a time in a random order (ported from prototype E's
// motion.js). For the city cards the blocks are the model's 640 m squares, so the change appears square by square,
// the way the model sees it.
import { reducedMotion } from "./motion";

type Drawable = CanvasImageSource & { width: number; height: number };

// The order the blocks change in: a shuffle with a fixed seed, so a card always dissolves the same way.
export function blockOrder(n: number, seed: number): number[] {
  const order = [...Array(n).keys()];
  let s = seed;
  for (let i = order.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// a and b: pictures of the same size. Returns { to(0|1) } to animate towards picture a (0) or b (1).
export function pixelSwap(canvas: HTMLCanvasElement, a: Drawable, b: Drawable, cols: number, rows: number, { ms = 700, seed = 1 } = {}) {
  // A plain CPU canvas: for these small pictures it is fast, and it skips the GPU canvas set-up, which froze one
  // frame for ~330 ms the first time a canvas appeared mid-scroll (measured in step 5.3a).
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const W = a.width, H = a.height;
  canvas.width = W; canvas.height = H;
  ctx.drawImage(a, 0, 0);
  const order = blockOrder(cols * rows, seed), total = order.length;
  const block = (k: number, img: Drawable) => {
    const c = order[k] % cols, r = Math.floor(order[k] / cols);
    const x0 = Math.floor((c * W) / cols), x1 = Math.floor(((c + 1) * W) / cols);
    const y0 = Math.floor((r * H) / rows), y1 = Math.floor(((r + 1) * H) / rows);
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  };
  let shown = 0, target = 0, raf = 0, last = 0; // shown = how many blocks show b now
  const tick = (t: number) => {
    const dt = last ? t - last : 16;
    last = t;
    const n = Math.max(1, Math.round((total * dt) / ms));
    if (shown < target) { const end = Math.min(target, shown + n); for (let k = shown; k < end; k++) block(k, b); shown = end; }
    else if (shown > target) { const end = Math.max(target, shown - n); for (let k = shown - 1; k >= end; k--) block(k, a); shown = end; }
    raf = shown === target ? 0 : requestAnimationFrame(tick);
  };
  return {
    to(v: 0 | 1) {
      target = v ? total : 0;
      if (reducedMotion()) { ctx.drawImage(v ? b : a, 0, 0); shown = target; return; }
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    },
  };
}

// Loads a picture for drawing on a canvas. createImageBitmap prepares it in the background, so the first draw is
// cheap (tested in step 5.3a).
export async function loadImage(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return createImageBitmap(await res.blob());
}
