// The Story's hero and its six chapter cards (ported from prototype E). Every number comes from a data file and
// has a source marker: summary.json (the Ahmedabad map), story.json (copied from results/ by src/web_story.py).
// `on` = the chapter is on screen now (replays its bars), `seen` = it has been on screen (count-ups run once).
import type { CSSProperties, ReactNode } from "react";
import { Button } from "../components/Button";
import { CountUp } from "../components/CountUp";
import { REPO } from "../components/SiteHeader";
import { SourceMarker } from "../components/SourceMarker";
import { className } from "../lib/classes";
import { km2, pct } from "../lib/data";
import { accuracyRows, mostSure, shrink, topShifts, waffleOrder, type StoryData } from "../lib/story";
import type { Checks, City } from "../lib/types";

export const SUM = "web/public/data/ahmedabad/summary.json";
export const CHAPTERS = ["The city", "What the model sees", "What changed", "How sure", "Europe → India", "Limits"];
const SHEET = ["Residential", "Industrial", "AnnualCrop", "Highway", "PermanentCrop", "River"]; // classes shown, if present
const plain = (k: string) => className(k).plain;
const one = (v: number) => v.toFixed(1);

export type Ctx = {
  city: City;
  story: StoryData;
  checks: Checks;
  years: string[];
  colour: Record<string, string>;
  on: (n: number) => boolean;
  seen: (n: number) => boolean;
  // Pointing at something in a card shows it on the map (null = stop).
  onSquare: (id: number | null) => void;
  onShift: (t: { from: string; to: string } | null) => void;
};

function Step({ n, ctx, children }: { n: number; ctx: Ctx; children: ReactNode }) {
  return (
    <div className={`step${ctx.on(n) ? " on" : ""}${ctx.seen(n) ? " seen" : ""}`} data-step={n} id={`c${n}`}>
      <article className="card">
        <div className="chap"><b>{String(n).padStart(2, "0")}</b><span>/ {String(CHAPTERS.length).padStart(2, "0")}</span><i /><span>{CHAPTERS[n - 1]}</span></div>
        {children}
      </article>
    </div>
  );
}

const HEADLINE = ["How", "much", "of", "Ahmedabad", "really", "changed?"];

export function Hero({ ctx }: { ctx: Ctx }) {
  const { city, story, years } = ctx, s = city.summary, a = story.ahmedabad;
  return (
    <div className="step hero" data-step={0}>
      <div className="hero-in">
        <h1 className="split" aria-label={HEADLINE.join(" ")}>
          {HEADLINE.map((w, i) => <span key={i} aria-hidden="true">{i > 0 && " "}<span className="w" style={{ "--i": i } as CSSProperties}>{w === "really" ? <em>{w}</em> : w}</span></span>)}
        </h1>
        <p className="lede rise">A model read satellite pictures of the city from {years[0]} and {years[1]} and named every 640&nbsp;m square. Then its work was checked, square by square.</p>
        <div className="actions rise">
          <Button href="#c1" arrow="down">Start the story</Button>
          <Button href="/explorer" variant="quiet">Open the Explorer</Button>
        </div>
        <dl className="hero-stats rise">
          <div><dt>squares mapped</dt><dd><CountUp to={s.n_patches} start delay={500} ms={1400} /><SourceMarker file={SUM} field="n_patches" note="Ahmedabad, one 640 m square each." /></dd></div>
          <div><dt>km² flagged as changed</dt><dd><CountUp to={a.reported_changed_km2} start delay={650} ms={1400} /><SourceMarker file={a.source} field="reported_changed_km2" note={`Squares whose class differs between ${years[0]} and ${years[1]}.`} /></dd></div>
          <div><dt>of checked changes held up</dt><dd><CountUp to={a.real_rate * 100} start delay={800} ms={1400} /><small>%</small><SourceMarker file={a.source} field="final.real_rate" note={`${a.n_pairs} random flagged squares, compared by eye.`} /></dd></div>
        </dl>
      </div>
    </div>
  );
}

export function TheCity({ ctx }: { ctx: Ctx }) {
  const s = ctx.city.summary, [y0, y1] = ctx.years;
  const note = "Clear Sentinel-2 scenes in the Dec–Feb window, merged per pixel (median).";
  return (
    <Step n={1} ctx={ctx}>
      <h2>Ahmedabad, seen from orbit.</h2>
      <p>Sentinel-2 photographs the city every few days. We merged <b><CountUp to={s.years[y0].n_scenes} start={ctx.seen(1)} ms={900} /></b><SourceMarker file={SUM} field={`years.${y0}.n_scenes`} note={note} /> clear winter days of {y0} and <b><CountUp to={s.years[y1].n_scenes} start={ctx.seen(1)} ms={900} delay={120} /></b><SourceMarker file={SUM} field={`years.${y1}.n_scenes`} note={note} /> of {y1} into one cloud-free picture per year.</p>
    </Step>
  );
}

export function WhatItSees({ ctx }: { ctx: Ctx }) {
  const { city, years, colour } = ctx, s = city.summary, y1 = years[1];
  const best = mostSure(city.patches, y1, s.grid_cols);
  const picked = SHEET.filter((k) => best[k]);
  const rgb = city.base + s.files.rgb[y1];
  return (
    <Step n={2} ctx={ctx}>
      <h2>Every 640&nbsp;m square gets a name.</h2>
      <p>The model looks at one square at a time and picks one of {Object.keys(colour).length} land-use classes. These are real squares from the {y1} picture, each the one the model was most sure about for its class.</p>
      <div className="figure sheet" onPointerLeave={() => ctx.onSquare(null)}>
        {picked.map((k, n) => {
          const b = best[k];
          return (
            <button type="button" className="tile" key={k} style={{ "--n": n } as CSSProperties}
              onPointerEnter={() => ctx.onSquare(b.id)} onFocus={() => ctx.onSquare(b.id)} onBlur={() => ctx.onSquare(null)}
              aria-label={`${plain(k)}, ${pct(b.conf, 0)}% sure: show on the map`}>
              <span className="px" style={{ "--c": colour[k], backgroundImage: `url(${rgb})`, backgroundSize: `${s.grid_cols * 100}% ${s.grid_rows * 100}%`, backgroundPosition: `${(b.col / (s.grid_cols - 1)) * 100}% ${(b.row / (s.grid_rows - 1)) * 100}%` } as CSSProperties}><span className="scan" /></span>
              <span className="tl">{plain(k)}<small>{pct(b.conf, 0)}% sure</small></span>
              <i className="conf" style={{ "--w": b.conf, "--c": colour[k] } as CSSProperties} />
            </button>
          );
        })}
      </div>
      <p className="hint"><span className="hint-dot" />Point at a square to find it on the map.</p>
    </Step>
  );
}

export function WhatChanged({ ctx }: { ctx: Ctx }) {
  const { city, years, colour } = ctx, s = city.summary;
  const { top, sameFrom } = topShifts(s.changes);
  const max = Math.max(...top.map((t) => t.km2));
  return (
    <Step n={3} ctx={ctx}>
      <h2>The model sees land changing use.</h2>
      <p>Between {years[0]} and {years[1]} it flags <b><CountUp to={s.changed_patches} start={ctx.seen(3)} ms={1000} /> of {s.n_patches.toLocaleString("en-US")} squares</b><SourceMarker file={SUM} field="changed_patches / n_patches" note="Model: fine-tuned EfficientNet-B0, seed 42 (ONNX)." /> as changed. {sameFrom ? `Its ${top.length} biggest shifts all start as ${plain(sameFrom).toLowerCase()}:` : `Its ${top.length} biggest shifts:`}<SourceMarker file={SUM} field={`changes[0..${top.length - 1}]`} note="Reported by the model; not each one checked." /></p>
      <div className="shifts" onPointerLeave={() => ctx.onShift(null)}>
        {top.map((t, n) => (
          <button type="button" className="shift" key={`${t.from}-${t.to}`}
            style={{ "--n": n, "--w": t.km2 / max, "--c0": colour[t.from], "--c1": colour[t.to] } as CSSProperties}
            onPointerEnter={() => ctx.onShift(t)} onFocus={() => ctx.onShift(t)} onBlur={() => ctx.onShift(null)}>
            <span className="sw"><i /><i /></span><span className="t">{plain(t.from)} → {plain(t.to)}</span>
            <span className="v"><CountUp to={t.km2} start={ctx.seen(3)} delay={250 + n * 90} /> km²</span><span className="bar"><i /></span>
          </button>
        ))}
      </div>
      <p className="hint"><span className="hint-dot" />Point at a shift to see only those squares.</p>
    </Step>
  );
}

export function HowSure({ ctx }: { ctx: Ctx }) {
  const a = ctx.story.ahmedabad, f = shrink(a);
  const [lo, hi] = a.estimated_real_changed_km2_95;
  return (
    <Step n={4} ctx={ctx}>
      <h2>How much of it held up?</h2>
      <p>We picked <b>{a.n_pairs}</b> flagged squares at random and compared the two pictures by eye. <b>{pct(a.real_rate, 0)}%</b><SourceMarker file={a.source} field="final.real_rate" note="Share of checked squares judged a real change." /> really changed.</p>
      <div className="figure measure">
        <div className="m-row">
          <div className="top"><span className="v">{km2(a.reported_changed_km2)}<small>km²</small></span><span className="l">reported by the model<SourceMarker file={a.source} field="reported_changed_km2" /></span></div>
          <div className="m-track"><i /></div>
        </div>
        <div className="m-row real">
          {/* Every time this chapter comes on screen, the number counts DOWN from the reported amount while the bar shrinks. */}
          <div className="top"><span className="v"><CountUp to={a.estimated_real_changed_km2} from={a.reported_changed_km2} start={ctx.on(4)} ms={900} delay={300} /><small>km²</small></span><span className="l">estimated real change<SourceMarker file={a.source} field="estimated_real_changed_km2" note="Reported area × share that held up." /></span></div>
          <div className="m-track"><i style={{ "--to": f.scale } as CSSProperties} /><span className="ci" style={{ "--lo": `${f.rangeLeft * 100}%`, "--w": `${f.rangeWidth * 100}%` } as CSSProperties} /></div>
        </div>
      </div>
      <div className="waffle" aria-label={`The ${a.n_pairs} checked squares: ${a.counts.yes} real, ${a.counts.unclear} unclear, ${a.counts.no} not real`} onPointerLeave={() => ctx.onSquare(null)}>
        {waffleOrder(ctx.checks.squares).map((q, i) => (
          <i key={q.pair} className={q.verdict} style={{ "--i": i } as CSSProperties} title={`${q.pair}: ${q.verdict}`} onPointerEnter={() => ctx.onSquare(q.id)} />
        ))}
      </div>
      <div className="key"><span><i className="yes" />Real change</span><span><i className="no" />Not real</span><span><i className="unclear" />Unclear</span></div>
      <p className="hint"><span className="hint-dot" />Point at a checked square to find it on the map.</p>
      <p className="cap">Hatched: 95% range {km2(lo)}–{km2(hi)} km²<SourceMarker file={a.source} field="estimated_real_changed_km2_95" />. Checked by eye: {a.judged_by}.</p>
    </Step>
  );
}

export function EuropeIndia({ ctx }: { ctx: Ctx }) {
  const i = ctx.story.india;
  return (
    <Step n={5} ctx={ctx}>
      <h2>Trained in Europe. Tested in India.</h2>
      <p>The model learned from European photos, and did much worse on Indian land. Fine-tuning on <b>{i.n_finetune_patches}</b><SourceMarker file={i.source} field="n_finetune_patches" note="Indian squares used for fine-tuning; the test areas were kept apart." /> labelled Indian squares closed part of the gap.</p>
      <div className="dots">
        {accuracyRows(i).map((r, n) => {
          const lo = (r.value.mean - r.value.std) * 100, hi = (r.value.mean + r.value.std) * 100;
          return (
            <div className={`dot-row${r.highlight ? " hl" : ""}`} key={r.key} style={{ "--n": n } as CSSProperties}>
              <span className="n">{r.label}</span>
              <span className="axis"><i className="w" style={{ left: `${lo}%`, width: `${hi - lo}%` }} /><i className="p" style={{ "--x": r.value.mean } as CSSProperties} /></span>
              <span className="val"><CountUp to={r.value.mean * 100} start={ctx.seen(5)} delay={200 + n * 120} format={one} />%<SourceMarker file={i.source} field={r.key} note={`EfficientNet-B0, seeds ${i.seeds.join("/")}, mean ± std.`} /></span>
            </div>
          );
        })}
      </div>
      <div className="ticks"><span>0%</span><span>50%</span><span>100%</span></div>
      <p className="cap">Accuracy on held-out test images. Dot = mean of {i.seeds.length} training runs, bar = ± spread.</p>
    </Step>
  );
}

export function Limits({ ctx }: { ctx: Ctx }) {
  const a = ctx.story.ahmedabad;
  return (
    <Step n={6} ctx={ctx}>
      <h2>What it can't do yet.</h2>
      <ul className="limits">
        <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 6v5M10 13.5v.5" strokeLinecap="round" /></svg><span><b>Only tested in Gujarat.</b>Maps of other places are untested.</span></li>
        <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 10h14M10 3v14" /></svg><span><b>640 m squares are coarse.</b>One square can hold a road, houses and a field; it gets one name.</span></li>
        <li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 15 8 9l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /></svg><span><b>Change is over-reported.</b>Only {pct(a.real_rate, 0)}%<SourceMarker file={a.source} field="final.real_rate" /> of checked changes held up in Ahmedabad; the other cities were not checked.</span></li>
      </ul>
      <p>On the map, faint squares are the ones the model was least sure about.</p>
      <div className="actions"><Button href="/explorer" arrow="right">Explore the cities</Button><Button href={REPO} variant="ghost">Read the code</Button></div>
    </Step>
  );
}
