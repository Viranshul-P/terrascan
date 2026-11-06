// The right panel: the chosen 640 m square in both years, the model's class and how sure it was, and whether it
// was in the hand check.
import type { CSSProperties } from "react";
import { Button } from "../components/Button";
import { SourceMarker } from "../components/SourceMarker";
import { className } from "../lib/classes";
import { pct } from "../lib/data";
import type { City } from "../lib/types";

type Props = {
  city: City;
  years: string[];
  colour: Record<string, string>;
  sel: number | null;
  verdict?: "yes" | "no" | "unclear";
  hidden: boolean;
  modelName: string;
  onClose: () => void;
  onZoom: () => void;
  onCopy: () => void;
};

const VERDICT = { yes: "a real change", no: "not a real change", unclear: "unclear" };

const EmptyIcon = () => (
  <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {[4, 17, 30].flatMap((y) => [4, 17, 30].map((x) => <rect key={`${x}${y}`} x={x} y={y} width="10" height="10" rx="2" fill={x === 17 && y === 17 ? "currentColor" : "none"} fillOpacity="0.25" />))}
  </svg>
);

export function Inspector({ city, years, colour, sel, verdict, hidden, modelName, onClose, onZoom, onCopy }: Props) {
  if (sel === null) {
    return (
      <aside className="panel right" data-hidden={hidden} aria-label="Selected square">
        <div className="empty"><EmptyIcon /><b>Pick a square</b>Click anywhere on the city to see what the model saw there, in both years.</div>
      </aside>
    );
  }
  const p = city.patches[sel];
  const s = city.summary;
  // A crop of the city picture showing just this square (the picture is cols x rows squares).
  const crop = (y: string) => ({
    backgroundImage: `url(${city.base}${s.files.rgb[y]})`,
    backgroundSize: `${s.grid_cols * 100}% ${s.grid_rows * 100}%`,
    backgroundPosition: `${(p.col / (s.grid_cols - 1)) * 100}% ${(p.row / (s.grid_rows - 1)) * 100}%`,
  });
  return (
    <aside className="panel right" data-hidden={hidden} aria-label="Selected square" aria-live="polite">
      <div className="p-head">
        <h2>Square <span className="mono">#{sel.toLocaleString("en-US")}</span></h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <div className="p-body" key={`${city.id}-${sel}`}>
        <div className="crops">
          {years.map((y) => (
            <div className="crop" key={y}>
              <div className="px" style={{ ...crop(y), "--c": colour[p.cls[y]] } as CSSProperties} role="img" aria-label={`Satellite picture of this square, ${y}`} />
              <span>{y}</span>
            </div>
          ))}
        </div>
        <p className="crop-note">20 m preview of the 640 m square. The model saw it at 10 m.</p>
        <div>{p.changed
          ? <span className="verdict changed"><i />Reported change</span>
          : <span className="verdict same"><i />No change reported</span>}</div>
        <div className="cls-rows">
          {years.map((y) => {
            const n = className(p.cls[y]);
            return (
              <div className="cls" key={y} style={{ "--c": colour[p.cls[y]] } as CSSProperties}>
                <span className="y">{y}</span>
                <div>
                  <div className="what"><span>{n.plain}{n.original && <small> {n.original}</small>}</span><span>{pct(p.conf[y], 0)}% sure</span></div>
                  <div className="bar"><i style={{ width: `${p.conf[y] * 100}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
        {verdict && (
          <div className="checked-note">This square was in the hand check: <b>{VERDICT[verdict]}</b>.
            <SourceMarker file="web/public/data/ahmedabad/checks.json" field="squares[].verdict" note="Copied from results/change_check_reviewed.csv: Claude first, then reviewed by the author." /></div>
        )}
        <dl className="meta-list">
          <dt>Centre</dt><dd>{p.lat.toFixed(4)}° N, {p.lon.toFixed(4)}° E</dd>
          <dt>Size</dt><dd>640 × 640 m</dd>
          <dt>Tile</dt><dd>{s.tile}</dd>
          <dt>Model</dt><dd>{modelName}</dd>
        </dl>
        <div className="insp-actions">
          <Button size="sm" variant="quiet" onClick={onZoom}>Zoom to square</Button>
          <Button size="sm" variant="ghost" onClick={onCopy}>Copy link</Button>
        </div>
      </div>
    </aside>
  );
}
