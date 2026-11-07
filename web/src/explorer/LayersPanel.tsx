// The left panel: what the map shows (switches + colour strength), the legend (also a class filter with km² bars),
// and the biggest changes (click one to show only those squares).
import { Legend, type LegendItem } from "../components/Legend";
import { Slider } from "../components/Slider";
import { SourceMarker } from "../components/SourceMarker";
import { Switch } from "../components/Toggle";
import { className } from "../lib/classes";
import { km2 } from "../lib/data";
import type { Snap } from "../lib/sheet";
import type { Change } from "../lib/types";
import { SheetGrabber } from "./SheetGrabber";

export type Layers = { sat: boolean; land: boolean; opacity: number; conf: boolean; change: boolean; checks: boolean };
export type Pair = { from: string; to: string } | null;

type Props = {
  layers: Layers;
  setLayers: (l: Layers) => void;
  legendTitle: string;
  legend: LegendItem[];
  active: string[] | null;
  onToggleClass: (key: string) => void;
  onShowAll: () => void;
  onPreview: (key: string | null) => void;
  changes: Change[];
  changedPatches: number;
  pair: Pair;
  onPair: (p: Pair) => void;
  checksCount: number | null; // null = this city was not checked by eye
  summaryFile: string;
  hidden: boolean;
  onHide: () => void;
  onArea: () => void; // open "Map your own area"
  snap: Snap; // phone bottom sheet height
  onSnap: (s: Snap) => void;
};

export function LayersPanel(p: Props) {
  const L = p.layers;
  const set = (patch: Partial<Layers>) => p.setLayers({ ...L, ...patch });
  return (
    <aside className="panel left" data-hidden={p.hidden} data-snap={p.snap} aria-label="Layers and legend">
      <SheetGrabber snap={p.snap} onSnap={p.onSnap} label="Layers and legend" />
      <div className="p-head">
        <h2>Layers</h2>
        <button type="button" className="head-area" onClick={p.onArea}>Map your area</button>
        <button type="button" className="icon-btn" onClick={p.onHide} aria-label="Hide panel">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m10 4-4 4 4 4" /></svg>
        </button>
      </div>
      <div className="p-body">
        <div className="group">
          <button type="button" className="area-entry" onClick={p.onArea}>
            <b>Map your own area</b><span>Draw a box and the model maps it live. Tested in Gujarat only.</span>
          </button>
        </div>
        <div className="group">
          <Switch label="Satellite picture" checked={L.sat} onChange={(v) => set({ sat: v })} />
          <Switch label="Land use" checked={L.land} onChange={(v) => set({ land: v })} />
          <Slider label="Colour strength" value={Math.round(L.opacity * 100)} onChange={(v) => set({ opacity: v / 100 })} format={(v) => `${v}%`} />
          <Switch label="Shade by confidence" hint="Faint = the model was unsure" checked={L.conf} onChange={(v) => set({ conf: v })} />
          <Switch label="Changes only" hint={`${p.changedPatches.toLocaleString("en-US")} squares flagged`} checked={L.change} onChange={(v) => { set({ change: v }); if (!v) p.onPair(null); }} />
          <Switch label="Checked by eye" disabled={p.checksCount === null}
            hint={p.checksCount === null ? "Only Ahmedabad was checked" : `${p.checksCount} squares, Ahmedabad only`}
            checked={L.checks && p.checksCount !== null} onChange={(v) => set({ checks: v })} />
        </div>

        <div className="group">
          <div className="label group-head"><span>{p.legendTitle}</span><span>km²</span></div>
          <Legend items={p.legend} format={km2} active={p.active} onToggle={p.onToggleClass} onPreview={p.onPreview} />
          <div className="leg-foot">
            <span>{p.active ? `${p.active.length} of ${p.legend.length} shown` : "Click a class to show only it"}</span>
            {p.active && <button type="button" onClick={p.onShowAll}>Show all</button>}
          </div>
        </div>

        <div className="group">
          <div className="label group-head"><span>Biggest changes<SourceMarker file={p.summaryFile} field="changes" note="Reported by the model; only Ahmedabad's were checked by eye, and about half held up there." /></span><span>km²</span></div>
          <div className="changes-list">
            {p.changes.map((c) => {
              const on = p.pair?.from === c.from && p.pair?.to === c.to;
              return (
                <button key={`${c.from}-${c.to}`} type="button" className="chg" aria-pressed={on}
                  onClick={() => { p.onPair(on ? null : { from: c.from, to: c.to }); if (!on) set({ change: true }); }}>
                  <span>{className(c.from).plain} → {className(c.to).plain}</span><span className="chg-v">{km2(c.km2)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
