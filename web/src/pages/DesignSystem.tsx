// Design system page (step 5.3a): every token and component on one page, in a small working demo.
// All numbers are read from web/public/data/ (Ahmedabad summary, class list, game data), never typed in.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Legend } from "../components/Legend";
import { Slider } from "../components/Slider";
import { Stat } from "../components/Stat";
import { SiteHeader } from "../components/SiteHeader";
import { Segmented, Switch } from "../components/Toggle";
import { className } from "../lib/classes";
import { km2, useJson } from "../lib/data";
import { useReveal } from "../lib/motion";
import "./DesignSystem.css";

type Index = { years: string[]; classes: { name: string; colour: string }[] };
type Summary = {
  name: string; n_patches: number; changed_km2: number; changed_patches: number;
  areas_km2: Record<string, Record<string, number>>; files: { overlay: Record<string, string> };
};
type Quiz = { model_accuracy: number; squares: unknown[] };

const SUM = "web/public/data/ahmedabad/summary.json";
const SURFACES = ["--bg", "--surface", "--surface-2", "--line-strong", "--ink-3", "--ink-2", "--ink"];
const ACCENTS = ["--accent-fill", "--accent", "--accent-wash", "--focus"];

function Section({ id, title, text, children }: { id: string; title: string; text: string; children: ReactNode }) {
  const rise = useReveal<HTMLElement>();
  return (
    <section className="ds-sec" id={id} aria-labelledby={`${id}-t`} {...rise}>
      <div className="ds-sec-head"><h2 id={`${id}-t`}>{title}</h2><p>{text}</p></div>
      {children}
    </section>
  );
}

export function DesignSystem() {
  const index = useJson<Index>("/data/index.json");
  const city = useJson<Summary>("/data/ahmedabad/summary.json");
  const quiz = useJson<Quiz>("/data/quiz/quiz.json");
  const [year, setYear] = useState<string | null>(null);
  const [showDelta, setShowDelta] = useState(true);
  const [opacity, setOpacity] = useState(60);
  const [only, setOnly] = useState<string[] | null>(null);
  const [pointing, setPointing] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);

  const error = index.error || city.error || quiz.error;
  if (error) return <p className="ds-error" role="alert">{error}</p>;
  if (!index.data || !city.data || !quiz.data) return <p className="ds-loading">Loading…</p>;

  const idx = index.data, s = city.data, q = quiz.data;
  const [y0, y1] = idx.years;
  const y = year ?? y1;
  const other = y === y1 ? y0 : y1;
  const toggleClass = (k: string) => {
    const set = new Set(only ?? []);
    set.has(k) ? set.delete(k) : set.add(k);
    setOnly(set.size ? [...set] : null);
  };

  return (
    <>
      <SiteHeader page="design" />

      <main className="wrap">
        <div className="ds-hero">
          <span className="eyebrow">Step 5.3a</span>
          <h1>The pieces TerraScan is built from.</h1>
          <p>One file of tokens sets every colour, size and motion. Every number on this page is read from the site's
            data files, and the <b>i</b> next to it says which one.</p>
        </div>

        <Section id="colour" title="Colour" text="Neutral greys, tinted towards the map's blue, and one accent: marigold. Switch the theme in the top right to see dark mode.">
          <div className="swatches">
            {[...SURFACES, ...ACCENTS].map((t) => (
              <div className="swatch" key={t}><i style={{ background: `var(${t})` }} /><code>{t}</code></div>
            ))}
          </div>
          <h3 className="ds-sub">Land-use classes</h3>
          <div className="swatches classes">
            {idx.classes.map((c) => {
              const n = className(c.name);
              return <div className="swatch" key={c.name}><i style={{ background: c.colour }} /><span>{n.plain}</span>{n.original && <code>{n.original}</code>}</div>;
            })}
          </div>
        </Section>

        <Section id="type" title="Type" text="Schibsted Grotesk for words, JetBrains Mono for data. Big, tight headlines; calm body text.">
          <div className="type-scale">
            <div className="t-4xl">How much of Ahmedabad <em>really</em> changed?</div>
            <div className="t-2xl">Every 640 m square gets a name.</div>
            <div className="t-lg">The model looks at one square at a time and picks one of {idx.classes.length} land-use classes.</div>
            <div className="t-sm mono">EfficientNet-B0 · 10 m Sentinel-2 · tile 43QBF</div>
          </div>
        </Section>

        <Section id="buttons" title="Buttons" text="Four looks for four jobs. Arrows nudge on hover; buttons press in when clicked.">
          <div className="row">
            <Button arrow="down">Start the story</Button>
            <Button variant="accent">Map this area</Button>
            <Button variant="quiet" arrow="right">Open the Explorer</Button>
            <Button variant="ghost">Cancel</Button>
          </div>
          <div className="row">
            <Button size="sm">Copy link</Button>
            <Button size="sm" variant="quiet">Zoom to square</Button>
            <Button size="sm" variant="ghost">Show all</Button>
            <Button size="sm" disabled>Disabled</Button>
          </div>
        </Section>

        <Section id="stats" title="Cards and stats" text="Big numbers count up the first time they are on screen. Cards catch the light under the mouse.">
          <div className="stat-cards" key={replay}>
            <Card interactive><Stat value={s.n_patches} label={`640 m squares mapped in ${s.name}`}
              source={{ file: SUM, field: "n_patches" }} /></Card>
            <Card interactive><Stat value={s.changed_km2} unit="km²" label={`flagged as changed, ${y0} to ${y1}`}
              source={{ file: SUM, field: "changed_km2", note: "Reported by the model; not each square checked." }} /></Card>
            <Card interactive><Stat value={q.model_accuracy * 100} unit="%" tone="accent" format={(v) => v.toFixed(1)}
              label={`right on ${q.squares.length} Indian test squares`}
              source={{ file: "web/public/data/quiz/quiz.json", field: "model_accuracy", note: "Same as results/india_after.json, seed 42." }} /></Card>
          </div>
          <div className="row"><Button size="sm" variant="quiet" onClick={() => setReplay(replay + 1)}>Count again</Button></div>
        </Section>

        <Section id="controls" title="Toggles, slider and legend" text="A small working map key: pick a year, fade the colours, point at a class, click to show only some.">
          <div className="controls">
            <Card className="controls-panel">
              <div className="ctl-stack">
                <Segmented label="Year" value={y} onChange={setYear} options={idx.years.map((v) => ({ value: v, label: v }))} />
                <Switch label={`Change vs ${other}`} hint="Shown next to each class" checked={showDelta} onChange={setShowDelta} />
                <Slider label="Land-use colours" value={opacity} onChange={setOpacity} format={(v) => `${v}%`} />
                <div className="leg-head"><span className="label">Land use, {y}</span><span className="label">km²</span></div>
                <Legend
                  items={idx.classes.map((c) => ({ key: c.name, colour: c.colour, value: s.areas_km2[y][c.name], delta: showDelta ? s.areas_km2[y][c.name] - s.areas_km2[other][c.name] : undefined }))}
                  format={km2} active={only} onToggle={toggleClass} onPreview={setPointing} />
                {only && <Button size="sm" variant="ghost" onClick={() => setOnly(null)}>Show all</Button>}
              </div>
            </Card>
            <figure className="preview">
              <div className="preview-img">
                <img src={`/data/ahmedabad/thumb_${y}.webp`} alt={`${s.name} from space, ${y}`} />
                <img className="ov" src={`/data/ahmedabad/${s.files.overlay[y]}`} alt="" style={{ opacity: opacity / 100 }} />
              </div>
              <figcaption>
                {pointing ? <>Pointing at <b>{className(pointing).plain}</b>: {km2(s.areas_km2[y][pointing])} km² in {y}.</>
                  : <>{s.name}, {y}: the model's class for each 640 m square, over the satellite picture.</>}
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section id="motion" title="Motion" text="Calm and purposeful: 160–400 ms, a soft ease-out, a small spring for things that land. Only transform and opacity move, and everything stops for visitors who ask for reduced motion.">
          <div className="motion-row">
            {["--d-1", "--d-2", "--d-3", "--d-4"].map((d) => (
              <div className="motion-chip" key={d} style={{ "--d": `var(${d})` } as CSSProperties}><i /><code>{d}</code></div>
            ))}
          </div>
        </Section>

        <p className="ds-foot">Design system built by Claude (Anthropic) from prototype E, the direction the author chose.</p>
      </main>
    </>
  );
}
