// The Engineering page: how TerraScan is built, for readers who want the technical side. Three pipelines (training,
// the precomputed city maps, and live mapping in the browser), the hard problems and how each was solved, and the
// stack. Every number comes from story.json (written by src/web_story.py from results/), with its source file.
import { useEffect, type ReactNode } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { REPO, SiteHeader } from "../components/SiteHeader";
import { DATA } from "../lib/city";
import { useJson } from "../lib/data";
import type { StoryData } from "../lib/story";
import "../story/Sections.css";
import "./Engineering.css";

type Eng = {
  onnx: { source: string; max_abs_logit_difference: number; tolerance: number; n_images: number };
  parity: { source: string; runs_compared: number; squares_compared: number; squares_same_class: number; all_same_scenes: boolean; max_centre_offset_m: number; median_browser_total_ms: number };
  calibration: { source: string; fit_pixels: number; n_fit_scenes: number };
  dataset: { source: string; patches: number; per_split: { train: number; test: number } };
};

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const code = (path: string) => `${REPO}/blob/main/${path}`;
const Src = ({ f }: { f: string }) => <a className="eng-src" href={code(f)} rel="noopener">{f}</a>;

// One step in a pipeline lane.
const N = ({ t, d, hot }: { t: string; d?: ReactNode; hot?: boolean }) => <li className={hot ? "hot" : undefined}><b>{t}</b>{d && <span>{d}</span>}</li>;

export function Engineering() {
  useEffect(() => { document.title = "Engineering · TerraScan"; }, []);
  const story = useJson<StoryData & { engineering: Eng }>(`${DATA}story.json`);
  const s = story.data;
  return (
    <>
      <SiteHeader page="engineering" />
      <main className="eng">
        {!s ? <p className="page-msg">{story.error ?? "Loading…"}</p> : <Body s={s} e={s.engineering} />}
      </main>
      <SiteFooter />
    </>
  );
}

function Body({ s, e }: { s: StoryData; e: Eng }) {
  const india = s.india.summary_mean_std_over_seeds;
  const before = india.india_test_accuracy_before, after = india.india_test_accuracy_after;
  const a = s.ahmedabad;
  const p = e.parity;
  return (
    <>
      <section className="eng-hero">
        <div className="wrap">
          <span className="eyebrow">Engineering</span>
          <h1>From raw satellite archives to a land-use map, in your browser.</h1>
          <p className="lead">TerraScan is three pipelines that must agree with each other: training in PyTorch, maps made ahead of time in Python, and live maps made on the visitor's own device. This page shows how they fit, what was hard, and the checks that keep them honest.</p>
          <dl className="eng-stats">
            <div><dt>browser vs Python, same class</dt><dd>{p.squares_same_class}<small>/{p.squares_compared}</small></dd><Src f={p.source} /></div>
            <div><dt>largest PyTorch vs ONNX logit gap</dt><dd>{e.onnx.max_abs_logit_difference.toExponential(1)}</dd><Src f={e.onnx.source} /></div>
            <div><dt>Indian test accuracy, before → after</dt><dd>{pct(before.mean, 0)}<small> → </small>{pct(after.mean, 0)}</dd><Src f={s.india.source} /></div>
            <div><dt>reported changes that held up</dt><dd>{pct(a.real_rate, 0)}</dd><Src f={a.source} /></div>
          </dl>
        </div>
      </section>

      <section className="sec eng-arch" aria-labelledby="archTitle">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="eyebrow">Architecture</span><h2 id="archTitle">Three pipelines, one model.</h2></div>
            <p>The same EfficientNet-B0 weights run in three places. Each lane below is real code in the repository; the dashed links are checks that two lanes give the same answer.</p>
          </div>
          <div className="lanes">
            <div className="lane">
              <div className="lane-head"><b>1 · Train</b><span>Python · PyTorch · laptop GPU</span></div>
              <ol>
                <N t="EuroSAT" d="Sentinel-2 RGB, 10 classes, one fixed split" />
                <N t={`${s.models.items.length} models compared`} d={`CNN from scratch, ResNet-18, EfficientNet-B0, satellite ResNet-18; up to ${Math.max(...s.models.items.map((m) => m.seeds.length))} seeds each`} />
                <N t="Indian squares" d={`${e.dataset.patches} with human-reviewed labels, split by area: ${e.dataset.per_split.train} tune / ${e.dataset.per_split.test} test`} />
                <N t="Fine-tune" d="all layers, EuroSAT mixed in so Europe is not forgotten" hot />
                <N t="ONNX export" d={`logits checked on ${e.onnx.n_images} images`} />
              </ol>
            </div>
            <div className="lane">
              <div className="lane-head"><b>2 · City maps, ahead of time</b><span>Python · rasterio · pystac</span></div>
              <ol>
                <N t="STAC search" d="Planetary Computer, dry-season windows, cloudy scenes dropped" />
                <N t="Offset fix per scene" d="+1000 removed when processing baseline ≥ 04.00" />
                <N t="Median composite" d="one cloud-free picture per year, same pixel grid" />
                <N t="Calibrate to EuroSAT" d={`straight-line fit on ${e.calibration.n_fit_scenes} European scenes only`} hot />
                <N t="64 × 64 squares → ONNX" d="classes + confidence, GeoJSON and WebP for MapLibre" />
              </ol>
            </div>
            <div className="lane live">
              <div className="lane-head"><b>3 · Any box, live</b><span>TypeScript · Web Worker · WebGPU</span></div>
              <ol>
                <N t="STAC search" d="same windows and scene choice, ported function by function" />
                <N t="COG range reads" d="only the 512 px blocks inside the box, fetched in 128 KB chunks" hot />
                <N t="UTM in TypeScript" d="Krüger series, rasterio's window rounding, checked against pyproj" />
                <N t="Median + calibration" d="numpy's rounding (half to even) reproduced" />
                <N t="ONNX Runtime Web" d="WebGPU, WebAssembly fallback; model hash-checked and cached" />
              </ol>
            </div>
          </div>
          <div className="checks">
            <span><i />ONNX = PyTorch: largest logit gap {e.onnx.max_abs_logit_difference.toExponential(1)} (limit {e.onnx.tolerance.toExponential(0)})</span>
            <span><i />Browser = Python: {p.squares_same_class} of {p.squares_compared} squares on {p.runs_compared} box-years, same scenes {p.all_same_scenes ? "every time" : "not always"}, {p.max_centre_offset_m} m apart</span>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="hardTitle">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="eyebrow">Hard problems</span><h2 id="hardTitle">What broke, and what fixed it.</h2></div>
            <p>Each card names the problem, the fix, and the file that holds the evidence.</p>
          </div>
          <div className="hard">
            <article>
              <h3>A model that aced Europe failed in India</h3>
              <p>On European test images it scored {pct(india.eurosat_test_accuracy_before.mean)}. On Indian land it fell to {pct(before.mean)} ± {pct(before.std)}: different crops, denser cities, other building materials.</p>
              <p><b>Fix:</b> fine-tune on {s.india.n_finetune_patches} labelled Indian squares from areas kept apart from the test areas. Indian test accuracy rose to {pct(after.mean)} ± {pct(after.std)} over {s.india.seeds.length} seeds, while Europe stayed at {pct(india.eurosat_test_accuracy_after.mean)}.</p>
              <Src f={s.india.source} />
            </article>
            <article>
              <h3>The training pictures and ours had different colours</h3>
              <p>EuroSAT was made from top-of-atmosphere (Level-1C) images; the archive serves surface reflectance (Level-2A). Same place, different numbers.</p>
              <p><b>Fix:</b> a per-colour straight-line fit from Level-2A to EuroSAT's colours, fitted on {e.calibration.fit_pixels.toLocaleString("en-US")} pixels from {e.calibration.n_fit_scenes} European scenes only, so no Indian answer leaks in.</p>
              <Src f={e.calibration.source} />
            </article>
            <article>
              <h3>Newer pictures are secretly brighter</h3>
              <p>Since processing baseline 04.00, Sentinel-2 adds 1000 to every value. Re-processed old scenes can carry it too, so the date tells you nothing.</p>
              <p><b>Fix:</b> decide per scene from its <code>s2:processing_baseline</code>, in Python and again in the browser, with tests for both.</p>
              <Src f="src/imagery.py" />
            </article>
            <article>
              <h3>A change map that cries wolf</h3>
              <p>Compare two years square by square and the model flags {a.reported_changed_km2.toFixed(0)} km² of Ahmedabad as changed. Is it?</p>
              <p><b>Fix:</b> {a.n_pairs} flagged squares picked at random and checked by eye on both pictures: {pct(a.real_rate, 0)} were real (95% range {pct(a.real_rate_95[0], 0)}–{pct(a.real_rate_95[1], 0)}), so about {a.estimated_real_changed_km2.toFixed(0)} km² is real change. The site says so.</p>
              <Src f={a.source} />
            </article>
            <article>
              <h3>No free server could run the live map</h3>
              <p>A free 0.1 CPU host timed out downloading pictures and running the model, and the paid ones were off the table.</p>
              <p><b>Fix:</b> move the whole pipeline into the browser: a Web Worker reads Cloud-Optimised GeoTIFFs with HTTP range requests and runs the model with WebGPU. Median time per box-year in a test browser: {(p.median_browser_total_ms / 1000).toFixed(1)} s, no server at all.</p>
              <Src f="web/src/live/engine.ts" />
            </article>
            <article>
              <h3>Two copies of a pipeline drift apart</h3>
              <p>A port that is 99% right gives quietly different maps: an off-by-one pixel window, a different rounding rule, a different scene picked.</p>
              <p><b>Fix:</b> a parity harness runs both pipelines on the same boxes (one outside Gujarat) and compares every square: same scenes, {p.max_centre_offset_m} m apart, {p.squares_same_class}/{p.squares_compared} same class.</p>
              <Src f={p.source} />
            </article>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="rigourTitle">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="eyebrow">Rigour</span><h2 id="rigourTitle">Rules the numbers follow.</h2></div>
            <p>Small data makes it easy to fool yourself. These rules are written in the repository and the code enforces most of them.</p>
          </div>
          <ul className="rules">
            <li><b>Split by place, not by picture.</b> Neighbouring squares look alike, so tune and test areas never touch.</li>
            <li><b>Test once.</b> Every choice is made on validation data; the test areas are scored at the end and reported as they came out.</li>
            <li><b>Three seeds, mean ± spread.</b> Two models whose ranges overlap are called the same, not ranked.</li>
            <li><b>Decide before you look.</b> Decision rules (class scheme, band comparison) are committed to git before any run.</li>
            <li><b>Every number has a source.</b> The site and README read numbers from <code>results/</code>; none are typed by hand.</li>
            <li><b>Tests on both sides.</b> pytest for the Python pipeline, Vitest for the website, including the projection maths against pyproj.</li>
          </ul>
        </div>
      </section>

      <section className="sec" aria-labelledby="stackTitle">
        <div className="wrap">
          <div className="sec-head">
            <div><span className="eyebrow">Stack</span><h2 id="stackTitle">All free, all open.</h2></div>
            <p>Free satellite data, open-source tools, and hosting that costs nothing.</p>
          </div>
          <div className="stack">
            {[["Data", "Sentinel-2 L2A · Planetary Computer STAC · EuroSAT"], ["Modelling", "PyTorch · torchvision · torchgeo · ONNX"], ["Geo", "rasterio · pystac-client · geotiff.js · own UTM code"], ["Browser ML", "ONNX Runtime Web · WebGPU · WebAssembly · Web Workers"], ["Web", "React · TypeScript · Vite · MapLibre GL"], ["Ops", "FastAPI · Docker · Hugging Face Hub · Vercel · pytest · Vitest · Playwright"]].map(([k, v]) => (
              <div key={k}><span>{k}</span><b>{v}</b></div>
            ))}
          </div>
          <div className="eng-cta">
            <a className="btn btn-primary" href="/explorer?area=1">Map a place yourself</a>
            <a className="btn btn-quiet" href={REPO} rel="noopener">Read the code</a>
          </div>
        </div>
      </section>
    </>
  );
}
