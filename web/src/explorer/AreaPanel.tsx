// The right panel for "Map your own area": instructions while drawing, the box and a "Map this box" button, a
// step-by-step progress list while the browser works, and the result (what changed, km² per class, how it was made,
// downloads). Everything runs in the visitor's browser (src/live/), so there is no server to wait for.
import { useEffect, useMemo, type CSSProperties } from "react";
import { Button } from "../components/Button";
import { Segmented } from "../components/Toggle";
import { className } from "../lib/classes";
import { pct } from "../lib/data";
import type { Snap } from "../lib/sheet";
import type { ClassInfo } from "../lib/types";
import type { Progress } from "../live/engine";
import { boxKm } from "../live/pipeline";
import { SheetGrabber } from "./SheetGrabber";
import { boxProblem, type useAreaMap } from "./useAreaMap";

type Area = ReturnType<typeof useAreaMap>;
export type Picked = { id: number; props: Record<string, string | number> } | null;

type Props = {
  area: Area;
  years: string[];
  classes: ClassInfo[];
  picked: Picked; // the live square the person tapped
  hidden: boolean;
  snap: Snap;
  onSnap: (s: Snap) => void;
  onMiddle: () => void; // "use the middle of the screen" (a way to make the box without dragging)
  changesOnly: boolean;
  onChangesOnly: (v: boolean) => void;
};

const km = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));
const plain = (c: string) => className(c).plain;

// The steps shown while mapping, in order. A step is done once a later one has started.
const STEPS: { stage: Progress["stage"]; label: (p: Progress | null) => string }[] = [
  { stage: "search", label: () => "Find clear Sentinel-2 pictures" },
  { stage: "pictures", label: (p) => `Read the pictures${p?.stage === "pictures" && p.total ? ` (${p.done} of ${p.total})` : ""}` },
  { stage: "model", label: (p) => `Run the model on every square${p?.stage === "model" && p.total ? ` (${p.done} of ${p.total})` : ""}` },
];
const ORDER: Progress["stage"][] = ["search", "model-download", "pictures", "model", "done"];

export function AreaPanel({ area, years, classes, picked, hidden, snap, onSnap, onMiddle, changesOnly, onChangesOnly }: Props) {
  const { mode, bbox, which, result, error, elapsed, progress, maxKm } = area;
  const problem = bbox ? boxProblem(bbox, maxKm) : null;
  const options = [...years.map((y) => ({ value: y, label: y })), ...(years.length > 1 ? [{ value: "both", label: "Both: what changed" }] : [])];
  return (
    <aside className="panel right area" data-hidden={hidden} data-snap={snap} aria-label="Map your own area">
      <SheetGrabber snap={snap} onSnap={onSnap} label="Map your own area" />
      <div className="p-head">
        <h2>Map your own area</h2>
        <button type="button" className="icon-btn" onClick={area.close} aria-label="Close">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <div className="p-body">
        {mode === "draw" && (
          <div className="area-step">
            <p className="area-lead">Pick any place: your browser downloads the satellite pictures and runs the model itself. No server, no sign-in.</p>
            <ol className="area-how">
              <li>Zoom to the place you want.</li>
              <li>Drag a box on the map (at most {maxKm} × {maxKm} km).</li>
            </ol>
            <Button size="sm" variant="quiet" onClick={onMiddle}>Use the middle of the screen</Button>
          </div>
        )}

        {(mode === "ready" || mode === "error") && bbox && (
          <div className="area-step">
            <dl className="meta-list">
              <dt>Box</dt><dd>{boxKm(bbox).map((v) => v.toFixed(1)).join(" × ")} km</dd>
              <dt>Centre</dt><dd>{((bbox[1] + bbox[3]) / 2).toFixed(4)}° N, {((bbox[0] + bbox[2]) / 2).toFixed(4)}° E</dd>
            </dl>
            {problem && <p className="area-problem" role="alert">{problem}</p>}
            {mode === "error" && <p className="area-problem" role="alert">{error}</p>}
            <div className="area-field"><span className="label">Map</span>
              <Segmented label="Year to map" value={which} onChange={area.setWhich} options={options} /></div>
            <div className="insp-actions">
              <Button size="sm" onClick={() => area.run()} disabled={!!problem}>{mode === "error" ? "Try again" : "Map this box"}</Button>
              <Button size="sm" variant="ghost" onClick={area.draw}>Draw again</Button>
            </div>
            {which === "both" && <p className="area-small">Both years take about twice as long: each year is a median of up to 5 clear winter pictures.</p>}
          </div>
        )}

        {mode === "running" && <Running progress={progress} elapsed={elapsed} onCancel={area.cancel} />}

        {mode === "done" && result && (
          <Result area={area} classes={classes} picked={picked} changesOnly={changesOnly} onChangesOnly={onChangesOnly} />
        )}

        <p className="area-limits">Accuracy was only measured in Gujarat: maps elsewhere are untested. A flagged change is the model's view, not a checked fact: see the Story for how many held up in Ahmedabad.</p>
      </div>
    </aside>
  );
}

function Running({ progress, elapsed, onCancel }: { progress: Progress | null; elapsed: number; onCancel: () => void }) {
  const at = progress ? ORDER.indexOf(progress.stage) : 0;
  const share = progress?.total ? (progress.done ?? 0) / progress.total : null;
  const modelMb = progress?.stage === "model-download" && progress.total ? `Downloading the model, once: ${Math.round(((progress.done ?? 0) / progress.total) * 100)}% of ${(progress.total / 1e6).toFixed(0)} MB` : null;
  return (
    <div className="area-step" role="status">
      <ol className="area-progress">
        {STEPS.map((s) => {
          const k = ORDER.indexOf(s.stage);
          const state = at > k ? "done" : at === k ? "now" : "todo";
          return (
            <li key={s.stage} data-state={state}>
              <i aria-hidden="true" />
              <span>{s.label(progress)}</span>
              {state === "now" && share !== null && <span className="bar" style={{ "--w": share } as CSSProperties} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      {modelMb && <p className="area-small">{modelMb}</p>}
      <p className="area-small">{elapsed} s · all of this runs in your browser. Usually 10–30 s.</p>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function Result({ area, classes, picked, changesOnly, onChangesOnly }: { area: Area; classes: ClassInfo[]; picked: Picked; changesOnly: boolean; onChangesOnly: (v: boolean) => void }) {
  const r = area.result!;
  const y = area.shown;
  const two = r.years.length === 2;
  const areas = r.areas_km2[y];
  const max = Math.max(...Object.values(areas), 0) || 1;
  const fmtMs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const geojsonUrl = useMemo(() => URL.createObjectURL(new Blob([JSON.stringify(r.patches_geojson)], { type: "application/geo+json" })), [r]);
  useEffect(() => () => URL.revokeObjectURL(geojsonUrl), [geojsonUrl]);
  const par = area.parity;
  return (
    <div className="area-step">
      {two && (
        <>
          <div className="area-change">
            <b>{r.n_changed.toLocaleString("en-US")}</b>
            <span>of {r.n_patches.toLocaleString("en-US")} squares changed class from {r.years[0]} to {r.years[1]} ({km(r.n_changed * r.km2_per_patch)} km²)</span>
          </div>
          {r.changes.length > 0 && (
            <ul className="area-shifts">
              {r.changes.slice(0, 4).map((c) => (
                <li key={`${c.from}>${c.to}`}>
                  <i style={{ background: classes.find((k) => k.name === c.from)?.colour }} /><span>{plain(c.from)}</span><span className="arr">→</span>
                  <i style={{ background: classes.find((k) => k.name === c.to)?.colour }} /><span>{plain(c.to)}</span>
                  <span className="mono">{km(c.km2)} km²</span>
                </li>
              ))}
            </ul>
          )}
          <label className="area-check"><input type="checkbox" checked={changesOnly} onChange={(e) => onChangesOnly(e.target.checked)} /> Show only the changed squares</label>
          <div className="area-field"><span className="label">Year on the map</span>
            <Segmented label="Year on the map" value={y} onChange={area.setShown} options={r.years.map((v) => ({ value: v, label: v }))} /></div>
        </>
      )}
      <div className="label group-head"><span>Land use in your box, {y}</span><span>km²</span></div>
      <ul className="area-bars">
        {classes.filter((c) => areas[c.name] > 0).map((c) => {
          const n = className(c.name);
          return (
            <li key={c.name} style={{ "--c": c.colour, "--w": areas[c.name] / max } as CSSProperties}>
              <i aria-hidden="true" /><span>{n.plain}{n.original && <small> {n.original}</small>}</span><span className="mono">{km(areas[c.name])}</span>
            </li>
          );
        })}
      </ul>
      <p className="area-picked" aria-live="polite">{picked
        ? <>Square you tapped: {r.years.map((yy, i) => <span key={yy}>{i > 0 && " → "}<b>{plain(String(picked.props[`class_${yy}`]))}</b> ({yy}, {pct(Number(picked.props[`confidence_${yy}`]), 0)}% sure)</span>)}</>
        : "Tap a square on the map to see its class and confidence."}</p>
      <details className="area-details">
        <summary>How this map was made</summary>
        <dl className="meta-list">
          {r.years.map((yy) => <span key={yy} style={{ display: "contents" }}><dt>Pictures {yy}</dt><dd>median of {r.info[yy].n_scenes} clear scenes, {r.info[yy].first_date} to {r.info[yy].last_date}{r.info[yy].offset_fixed ? ` (+1000 offset removed in ${r.info[yy].offset_fixed})` : ""}</dd></span>)}
          <dt>Tile</dt><dd>{r.tile} (EPSG:{r.epsg})</dd>
          <dt>Model</dt><dd>EfficientNet-B0 fine-tuned on Indian squares, run with {r.backend === "webgpu" ? "WebGPU (your graphics card)" : "WebAssembly (your processor)"}</dd>
          <dt>Average confidence</dt><dd>{pct(r.mean_confidence[y], 0)}%</dd>
          <dt>Downloaded</dt><dd>{(r.bytes_read / 1e6).toFixed(1)} MB of pixels (only the blocks inside the box)</dd>
          <dt>Time</dt><dd>search {fmtMs(r.timings_ms.search)}, pictures {fmtMs(r.timings_ms.pictures)}, model {fmtMs(r.timings_ms.model)}</dd>
        </dl>
        {par && <p className="area-small">Same steps and settings as the Python pipeline. Checked on {par.runs_compared} box-years: same class for {par.squares_same_class} of {par.squares_compared} squares ({par.source}).</p>}
      </details>
      {r.n_patches_touching_finetune_area > 0 && (
        <p className="checked-note">{r.n_patches_touching_finetune_area.toLocaleString("en-US")} of these squares touch an area used to fine-tune the model, so it may do better there than on a brand-new place.</p>
      )}
      <div className="insp-actions">
        <a className="btn btn-quiet btn-sm" href={r.geotiff[y]} download={`terrascan-${r.tile}-${y}.tif`}>GeoTIFF ({y})</a>
        <a className="btn btn-ghost btn-sm" href={geojsonUrl} download={`terrascan-${r.tile}.geojson`}>GeoJSON</a>
        <Button size="sm" variant="ghost" onClick={area.draw}>New box</Button>
      </div>
    </div>
  );
}
