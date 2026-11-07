// "Europe: five models, one test" (step 5.3c): the EuroSAT model comparison as cards. Pick what to compare
// (accuracy, speed or size); every card shows that measure as a bar. Numbers: story.json, copied from
// results/<model>.json by src/web_story.py. "About the same" = the mean ± std ranges overlap (results/comparison.md rule).
import { useState, type CSSProperties } from "react";
import { CountUp } from "../components/CountUp";
import { SourceMarker } from "../components/SourceMarker";
import { useSeen, useSpotlight } from "../lib/motion";
import { compareAccuracy, fromScratch, MODEL_INFO, ourModel, type ModelResult, type StoryData } from "../lib/story";

type Measure = "accuracy" | "speed" | "size";
const MEASURES: { id: Measure; label: string; hint: string }[] = [
  { id: "accuracy", label: "Accuracy", hint: "Share of European test images named right. Higher is better." },
  { id: "speed", label: "Speed", hint: "Milliseconds per image on one laptop CPU thread. Shorter is faster." },
  { id: "size", label: "Size", hint: "Number of learned weights (parameters). Smaller is lighter." },
];
const name = (m: ModelResult) => MODEL_INFO[m.name]?.name ?? m.name;
const pct1 = (v: number) => (v * 100).toFixed(1);
const pct2 = (v: number) => (v * 100).toFixed(2);
const millions = (v: number) => (v / 1e6).toFixed(v < 1e6 ? 2 : 1);

// How long each card's bar is (0..1). Accuracy starts its axis just below the lowest range, so small but real
// differences are visible; the axis start is printed under the cards.
export function barLength(items: ModelResult[], measure: Measure) {
  if (measure === "speed") { const max = Math.max(...items.map((m) => m.cpu_ms_per_image.mean)); return { from: 0, len: (m: ModelResult) => m.cpu_ms_per_image.mean / max }; }
  if (measure === "size") { const max = Math.max(...items.map((m) => m.params)); return { from: 0, len: (m: ModelResult) => m.params / max }; }
  const from = Math.floor(Math.min(...items.map((m) => m.accuracy.mean - m.accuracy.std)) * 100 - 1) / 100;
  return { from, len: (m: ModelResult) => (m.accuracy.mean - from) / (1 - from) };
}

// One sentence comparing our from-scratch model with the pretrained ones, built from the data.
export function verdict(items: ModelResult[]) {
  const ours = ourModel(items);
  if (!ours) return null;
  const others = items.filter((m) => !fromScratch(m));
  const by = (r: string) => others.filter((m) => compareAccuracy(ours, m) === r).map(name);
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const parts = [
    by("same").length && `about as accurate as ${list(by("same"))}`,
    by("higher").length && `more accurate than ${list(by("higher"))}`,
    by("lower").length && `less accurate than ${list(by("lower"))}`,
  ].filter(Boolean);
  // Speed too, so the page doesn't only say what flatters our model.
  const faster = others.filter((m) => m.cpu_ms_per_image.mean < ours.cpu_ms_per_image.mean).map(name);
  const speed = faster.length ? ` It is not the fastest: ${list(faster)} ${faster.length > 1 ? "run" : "runs"} faster on a laptop CPU.` : "";
  return { ours, text: `${name(ours)}, trained from scratch, is ${list(parts as string[])}.${speed}` };
}

export function Models({ story }: { story: StoryData }) {
  const items = story.models.items;
  const [measure, setMeasure] = useState<Measure>("accuracy");
  const { ref, seen } = useSeen<HTMLDivElement>(0.2);
  const v = verdict(items);
  const bar = barLength(items, measure);
  return (
    <section className="sec models" id="models" aria-labelledby="modelsTitle">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <span className="eyebrow">Europe</span>
            <h2 id="modelsTitle">Small model, built from scratch.</h2>
          </div>
          <p>Before India, the models were tested on European satellite images they never trained on. {v && <b>{v.text}</b>} Ranges that overlap count as the same.</p>
        </div>
        <div className="measure-pick" role="group" aria-label="Compare by">
          {MEASURES.map((m) => <button key={m.id} type="button" aria-pressed={measure === m.id} onClick={() => setMeasure(m.id)}>{m.label}</button>)}
          <span className="measure-hint">{MEASURES.find((m) => m.id === measure)!.hint}</span>
        </div>
        <div className="model-cards" ref={ref} data-seen={seen}>
          {items.map((m, n) => <ModelCard key={m.name} m={m} n={n} ours={m.name === v?.ours.name} measure={measure} len={bar.len(m)} seen={seen} />)}
        </div>
        <p className="cap">{story.models.note} {measure === "accuracy" && `Accuracy bars start at ${Math.round(bar.from * 100)}%.`} Mean ± std over the seeds listed on each card.</p>
      </div>
    </section>
  );
}

function ModelCard({ m, n, ours, measure, len, seen }: { m: ModelResult; n: number; ours: boolean; measure: Measure; len: number; seen: boolean }) {
  const spot = useSpotlight<HTMLElement>(4);
  const seeds = `seed${m.seeds.length > 1 ? "s" : ""} ${m.seeds.join(", ")}`;
  const big = {
    accuracy: <><CountUp to={m.accuracy.mean * 100} start={seen} format={(x) => x.toFixed(1)} delay={n * 80} /><small>%</small><span className="pm">{m.seeds.length > 1 ? `± ${pct2(m.accuracy.std)}` : "1 seed"}</span><SourceMarker file={m.source} field="seeds.*.accuracy" note={`Mean ± std, ${seeds}.`} /></>,
    speed: <><CountUp to={m.cpu_ms_per_image.mean} start={seen} format={(x) => x.toFixed(1)} delay={n * 80} /><small>ms</small><SourceMarker file={m.source} field="seeds.*.cpu_ms_per_image" note={`Mean over ${seeds}.`} /></>,
    size: <><CountUp to={m.params / 1e6} start={seen} format={(x) => x.toFixed(m.params < 1e6 ? 2 : 1)} delay={n * 80} /><small>M</small><SourceMarker file={m.source} field="seeds.*.params" note="Learned weights (parameters)." /></>,
  }[measure];
  return (
    <article className={`mcard${ours ? " ours" : ""}`} ref={spot} style={{ "--n": n, "--len": Math.max(0.02, len) } as CSSProperties}>
      <div className="m-top"><b>{MODEL_INFO[m.name]?.name ?? m.name}</b>{ours && <span className="tag">Ours</span>}</div>
      <span className="m-start">{MODEL_INFO[m.name]?.start ?? ""} · {m.image_size}×{m.image_size} px input</span>
      <div className="m-big">{big}</div>
      <span className="m-bar"><i /></span>
      <dl className="m-all">
        <div><dt>Accuracy</dt><dd>{pct1(m.accuracy.mean)}%</dd></div>
        <div><dt>CPU</dt><dd>{m.cpu_ms_per_image.mean.toFixed(1)} ms</dd></div>
        <div><dt>Size</dt><dd>{millions(m.params)} M</dd></div>
      </dl>
      <span className="m-seeds">{seeds}</span>
    </article>
  );
}
