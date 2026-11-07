// The right panel for "Map your own area": instructions while drawing, the box and a "Map this box" button, a
// progress state while the server works, and the result (km² per class, confidence, a GeoTIFF download).
// Every state says what is happening in plain words, including that a free server may be asleep.
import type { CSSProperties } from "react";
import { Button } from "../components/Button";
import { SourceMarker } from "../components/SourceMarker";
import { Segmented } from "../components/Toggle";
import { boxKm, boxProblem } from "../lib/api";
import { className } from "../lib/classes";
import { pct } from "../lib/data";
import type { Snap } from "../lib/sheet";
import type { ClassInfo } from "../lib/types";
import { SheetGrabber } from "./SheetGrabber";
import type { useAreaMap } from "./useAreaMap";

type Area = ReturnType<typeof useAreaMap>;
export type Picked = { cls: string; conf: number } | null;

type Props = {
  area: Area;
  years: string[];
  classes: ClassInfo[];
  picked: Picked; // the live square the person tapped
  hidden: boolean;
  snap: Snap;
  onSnap: (s: Snap) => void;
  onMiddle: () => void; // "use the middle of the screen" (a way to make the box without dragging)
};

const SERVER_NOTE: Record<Area["server"], (a: Area) => string> = {
  none: () => "Live mapping is not switched on in this version of the site yet.",
  unknown: () => "",
  checking: () => "Checking that the mapping server is awake…",
  waking: (a) => `The server is waking up (a free server sleeps when nobody uses it). The first map can take up to ${a.limits.timeout_s} seconds.`,
  awake: () => "The mapping server is awake.",
  off: () => "Cannot reach the mapping server right now.",
};

const km = (v: number) => v.toFixed(2);

export function AreaPanel({ area, years, classes, picked, hidden, snap, onSnap, onMiddle }: Props) {
  const { mode, bbox, year, result, error, server, limits, elapsed } = area;
  const problem = bbox ? boxProblem(bbox, limits.max_side_km) : null;
  const note = SERVER_NOTE[server](area);
  const live = server !== "none";
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
        {note && <p className="area-server" data-state={server} role="status">{note}</p>}

        {mode === "draw" && (
          <div className="area-step">
            <p>Zoom to the place you want, then drag a box on the map. The box can be at most {limits.max_side_km} × {limits.max_side_km} km.</p>
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
            <div className="area-field"><span className="label">Year</span>
              <Segmented label="Year to map" value={year} onChange={area.setYear} options={years.map((y) => ({ value: y, label: y }))} /></div>
            <div className="insp-actions">
              <Button size="sm" onClick={() => area.run()} disabled={!!problem || !live}>{mode === "error" ? "Try again" : "Map this box"}</Button>
              <Button size="sm" variant="ghost" onClick={area.draw}>Draw again</Button>
            </div>
          </div>
        )}

        {mode === "running" && (
          <div className="area-step" role="status">
            <div className="progress" aria-hidden="true"><i /></div>
            <p><b>{server === "checking" || server === "waking" || server === "unknown" ? "Waking up the server, then mapping" : "Mapping your box"}</b> · {elapsed} s</p>
            <p className="area-small">The server downloads the Sentinel-2 pictures and runs the model. It gives up after {limits.timeout_s} seconds. There is no percentage because the server does this in one go.</p>
            <Button size="sm" variant="ghost" onClick={area.cancel}>Cancel</Button>
          </div>
        )}

        {mode === "done" && result && (
          <Result area={area} years={years} classes={classes} picked={picked} />
        )}

        <p className="area-limits">Live maps show one year, so they show what the model sees, not what changed. Accuracy was only measured in Gujarat: maps elsewhere are untested.</p>
      </div>
    </aside>
  );
}

function Result({ area, years, classes, picked }: { area: Area; years: string[]; classes: ClassInfo[]; picked: Picked }) {
  const { map, year } = area.result!;
  const areas = map.areas_km2[year];
  const max = Math.max(...Object.values(areas), 0) || 1;
  const info = map.years[year];
  const other = years.find((y) => y !== year);
  const src = { file: "POST /predict response (not a saved file)", field: "areas_km2" };
  return (
    <div className="area-step">
      <div className="label group-head"><span>Land use in your box, {year}</span><span>km²</span></div>
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
      <dl className="meta-list">
        <dt>Squares</dt><dd>{map.n_patches.toLocaleString("en-US")} of 640 × 640 m</dd>
        <dt>Average confidence</dt><dd>{pct(map.mean_confidence[year], 0)}%<SourceMarker {...src} field={`mean_confidence.${year}`} note="Average of the model's confidence over all squares in the box." /></dd>
        <dt>Pictures</dt><dd>{info.n_scenes} scenes, {info.first_date} to {info.last_date}</dd>
        <dt>Tile</dt><dd>{map.tile}</dd>
      </dl>
      <p className="area-small">{map.scene_note}.</p>
      {map.n_patches_touching_finetune_area > 0 && (
        <p className="checked-note">{map.n_patches_touching_finetune_area.toLocaleString("en-US")} of these squares touch an area used to fine-tune the model, so it may do better there than on a brand-new place.</p>
      )}
      <p className="area-picked" aria-live="polite">{picked
        ? <>Square you tapped: <b>{className(picked.cls).plain}</b>, {pct(picked.conf, 0)}% sure</>
        : "Tap a square on the map to see its class and confidence."}</p>
      <div className="insp-actions">
        <a className="btn btn-quiet btn-sm" href={map.files.geotiff[year]} download={`terrascan-box-${year}.tif`}>Download GeoTIFF</a>
        {other && <Button size="sm" variant="ghost" onClick={() => area.run(other)}>Map {other} instead</Button>}
        <Button size="sm" variant="ghost" onClick={area.draw}>New box</Button>
      </div>
    </div>
  );
}
