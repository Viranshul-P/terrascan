// "The cities, two winters" (ported from prototype E): one card per showcase city. Pointing at a card (or tapping, on
// a phone it plays once when the card is fully on screen) turns its picture from the first year to the second, one
// 640 m square at a time. Numbers: each city's summary.json (made by src/showcase.py).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CountUp } from "../components/CountUp";
import { className } from "../lib/classes";
import { DATA } from "../lib/city";
import { getJson } from "../lib/data";
import { reducedMotion, useSeen, useSpotlight } from "../lib/motion";
import { loadImage, pixelSwap } from "../lib/pixelSwap";
import type { Index, Summary } from "../lib/types";

const plain = (k: string) => className(k).plain;

export function Cities({ index }: { index: Index }) {
  const { ref, seen } = useSeen<HTMLElement>(0);
  const [sums, setSums] = useState<Summary[] | null>(null);
  useEffect(() => {
    if (!seen || sums) return;
    Promise.all(index.cities.map((c) => getJson<Summary>(DATA + c.summary))).then(setSums).catch(() => setSums([]));
  }, [seen, sums, index]);
  const [y0, y1] = index.years;
  return (
    <section className="sec cities" id="cities" ref={ref} aria-labelledby="citiesTitle">
      <div className="wrap">
        <div className="sec-head">
          <div><span className="eyebrow">More cities</span><h2 id="citiesTitle">{index.cities.length} cities, two winters.</h2></div>
          <p>Maps made ahead of time, so they open instantly. Watch each city change from {y0} to {y1}, square by square.</p>
        </div>
        <div className="city-cards">
          {(sums ?? []).map((s, n) => <CityCard key={s.id} s={s} n={n} years={index.years} />)}
        </div>
        <p className="unchecked">Change numbers are what the model reports. Only Ahmedabad's were checked by eye.</p>
      </div>
    </section>
  );
}

function CityCard({ s, n, years }: { s: Summary; n: number; years: string[] }) {
  const [y0, y1] = years;
  const spot = useSpotlight<HTMLAnchorElement>(5);
  const { ref: inRef, seen } = useSeen<HTMLSpanElement>(0.2);
  const canvas = useRef<HTMLCanvasElement>(null);
  const swap = useRef<ReturnType<typeof pixelSwap> | null>(null);
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState<0 | 1>(0);
  const top = s.changes[0];

  // Small pictures (thumb_<year>.webp, made by scripts/web_thumbs.py) with the land-use colours on top, drawn once.
  useEffect(() => {
    if (!seen) return;
    let live = true;
    const base = `${DATA}${s.id}/`;
    Promise.all([loadImage(`${base}thumb_${y0}.webp`), loadImage(`${base}thumb_${y1}.webp`), loadImage(base + s.files.overlay[y0]), loadImage(base + s.files.overlay[y1])])
      .then(([a, b, oa, ob]) => {
        if (!live || !canvas.current) return;
        const tint = (img: ImageBitmap, ov: ImageBitmap) => {
          const cv = document.createElement("canvas");
          cv.width = img.width; cv.height = img.height;
          const x = cv.getContext("2d", { willReadFrequently: true })!;
          x.drawImage(img, 0, 0);
          x.globalAlpha = 0.34; x.imageSmoothingEnabled = false;
          x.drawImage(ov, 0, 0, cv.width, cv.height);
          return cv;
        };
        swap.current = pixelSwap(canvas.current, tint(a, oa), tint(b, ob), s.grid_cols, s.grid_rows, { ms: 900, seed: n + 7 });
        setReady(true);
      })
      .catch(() => { /* the card still works as a link, without its picture */ });
    return () => { live = false; };
  }, [seen, s, n, y0, y1]);

  const go = (v: 0 | 1) => { swap.current?.to(v); setYear(v); };
  // Touch screens have no hover: play the change once when the card is fully on screen.
  useEffect(() => {
    if (!ready || typeof matchMedia !== "function" || matchMedia("(hover: hover)").matches) return;
    const el = spot.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { window.setTimeout(() => go(1), reducedMotion() ? 0 : 400); io.disconnect(); } }, { threshold: 0.9 });
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  return (
    <a className="ccard" href={`/explorer?city=${s.id}`} ref={spot} style={{ "--n": n } as CSSProperties} data-year={year}
      onPointerEnter={() => go(1)} onPointerLeave={() => go(0)} onFocus={() => go(1)} onBlur={() => go(0)}>
      <span className="mosaic" ref={inRef}>
        <canvas ref={canvas} className={ready ? "ready" : undefined} aria-hidden="true" />
        <span className="yr"><b>{y0}</b><b>{y1}</b></span>
      </span>
      <span className="body">
        <b>{s.name}</b>
        <span className="c-stat"><CountUp to={s.changed_km2} start={seen} delay={150 + n * 80} /> km² reported changed · {s.n_patches.toLocaleString("en-US")} squares</span>
        {top && <span className="flip"><span>Biggest shift</span><span>{plain(top.from)} → {plain(top.to)}</span></span>}
        <span className="go">Open in Explorer <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg></span>
      </span>
    </a>
  );
}
