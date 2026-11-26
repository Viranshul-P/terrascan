// "Map any place" (the Story's invitation to the in-browser mapper, web/src/live/). On the left, the four steps the
// browser runs. On the right, a small replay on the real Ahmedabad picture: a box is drawn, then the model's real
// classes for those squares (overlay_<year>.png, one pixel per square) fill it in one by one. The parity numbers come
// from live.json (written from results/browser_parity.json).
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { DATA } from "../lib/city";
import { getJson } from "../lib/data";
import { easeOut, reducedMotion, useSeen } from "../lib/motion";
import { blockOrder, loadImage } from "../lib/pixelSwap";
import type { Summary } from "../lib/types";
import type { LiveConfig } from "../live/pipeline";

const STEPS = [
  { t: "Find pictures", d: "Search the free Sentinel-2 archive for the clearest winter days over your box." },
  { t: "Read only your box", d: "Fetch just the pixel blocks inside it, a few MB instead of whole satellite pictures." },
  { t: "One clear picture per year", d: "Take the per-pixel median of up to 5 days, so clouds and haze drop out." },
  { t: "Name every square", d: "Run the fine-tuned EfficientNet-B0 on your graphics card (WebGPU) or processor." },
];
// The part of the city the replay maps, in squares (column, row, width, height). Picked to fit a 6 km box.
const BOX = { c: 10, r: 9, w: 9, h: 9 };

export function MapAnyPlace({ year }: { year: string }) {
  const { ref, seen } = useSeen<HTMLElement>(0.3);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [parity, setParity] = useState<LiveConfig["parity"]>(null);
  const [step, setStep] = useState(-1); // which pipeline step is lit while the replay runs

  useEffect(() => {
    if (!seen) return;
    getJson<LiveConfig>(`${DATA}live.json`).then((c) => setParity(c.parity)).catch(() => undefined);
    let raf = 0, live = true;
    const base = `${DATA}ahmedabad/`;
    getJson<Summary>(`${base}summary.json`).then(async (s) => {
      const [pic, ov] = await Promise.all([loadImage(`${base}thumb_${year}.webp`), loadImage(base + s.files.overlay[year])]);
      const cv = canvas.current;
      if (!live || !cv) return;
      const sq = pic.width / s.grid_cols; // one square in picture pixels
      // Zoomed in: the canvas shows the box plus a margin of squares around it, at 2x for sharpness.
      const M = 4, cx0 = (BOX.c - M) * sq, cy0 = (BOX.r - M) * sq, Z = 3;
      cv.width = Math.round((BOX.w + 2 * M) * sq * Z); cv.height = Math.round((BOX.h + 2 * M) * sq * Z);
      const x = cv.getContext("2d")!;
      x.setTransform(Z, 0, 0, Z, -cx0 * Z, -cy0 * Z);
      const bx = BOX.c * sq, by = BOX.r * sq, bw = BOX.w * sq, bh = BOX.h * sq;
      const order = blockOrder(BOX.w * BOX.h, 3);
      const draw = (k: number) => { // k: 0..1 over the whole replay
        x.imageSmoothingEnabled = true;
        x.globalAlpha = 1; x.drawImage(pic, 0, 0);
        x.fillStyle = "rgba(5,7,10,0.35)"; x.fillRect(0, 0, pic.width, pic.height); // dim outside the box
        x.drawImage(pic, bx, by, bw, bh, bx, by, bw, bh);
        // 1. the box is drawn (0 - 0.2)
        const kb = Math.min(1, k / 0.2);
        x.strokeStyle = "#ffb224"; x.lineWidth = 1.2; x.setLineDash([5, 3.5]);
        const per = 2 * (bw + bh), len = per * easeOut(kb);
        x.beginPath();
        const pts = [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh], [bx, by]];
        let left = len;
        x.moveTo(bx, by);
        for (let i = 1; i < pts.length && left > 0; i++) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], seg = Math.hypot(x1 - x0, y1 - y0), f = Math.min(1, left / seg);
          x.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f); left -= seg;
        }
        x.stroke(); x.setLineDash([]);
        // 2. a scan line sweeps the box (0.2 - 0.45): reading the pictures
        if (k > 0.2 && k < 0.47) {
          const ys = by + bh * Math.min(1, (k - 0.2) / 0.25);
          const g = x.createLinearGradient(0, ys - sq * 2, 0, ys);
          g.addColorStop(0, "rgba(255,178,36,0)"); g.addColorStop(1, "rgba(255,178,36,0.45)");
          x.fillStyle = g; x.fillRect(bx, ys - sq * 2, bw, sq * 2);
        }
        // 3. squares fill in, in a scattered order (0.45 - 1)
        const kf = Math.max(0, (k - 0.45) / 0.55), n = Math.floor(order.length * kf);
        x.imageSmoothingEnabled = false; x.globalAlpha = 0.72;
        for (let i = 0; i < n; i++) {
          const j = order[i], c = BOX.c + (j % BOX.w), r = BOX.r + Math.floor(j / BOX.w);
          x.drawImage(ov, c, r, 1, 1, c * sq + 1, r * sq + 1, sq - 2, sq - 2);
        }
        x.globalAlpha = 1;
      };
      if (reducedMotion()) { draw(1); setStep(3); return; }
      const ms = 5200;
      let t0 = 0;
      const tick = (t: number) => {
        t0 ||= t;
        const k = Math.min(1, (t - t0) / ms);
        draw(k);
        setStep(k < 0.2 ? 0 : k < 0.47 ? 1 : k < 0.55 ? 2 : 3);
        if (k < 1 && live) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => undefined);
    return () => { live = false; cancelAnimationFrame(raf); };
  }, [seen, year]);

  return (
    <section className="sec anyplace" ref={ref} aria-labelledby="anyTitle">
      <div className="wrap any-grid">
        <div>
          <span className="eyebrow">Your turn, anywhere</span>
          <h2 id="anyTitle">Map any place. Your browser does the work.</h2>
          <p className="any-lede">Draw a box in the Explorer and the whole pipeline runs on your device: no server, no account, nothing to install. Pick one year, or both to see what changed.</p>
          <ol className="any-steps">
            {STEPS.map((s, i) => (
              <li key={s.t} data-on={step === i} data-done={step > i}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div><b>{s.t}</b><span>{s.d}</span></div>
              </li>
            ))}
          </ol>
          <div className="any-actions">
            <Button href="/explorer?area=1" arrow="right">Try it: map a place</Button>
            {parity && <span className="any-proof"><b>{parity.squares_same_class}/{parity.squares_compared}</b> squares match the Python pipeline</span>}
          </div>
        </div>
        <figure className="any-shot">
          <canvas ref={canvas} role="img" aria-label="Replay: a box drawn over Ahmedabad fills with the model's land-use squares" />
          <figcaption>Replay on Ahmedabad, {year}: real model output for each 640 m square.</figcaption>
        </figure>
      </div>
    </section>
  );
}
