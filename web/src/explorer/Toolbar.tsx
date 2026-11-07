// The Explorer's toolbar: city picker, year, compare, downloads, copy link.
import { useState } from "react";
import { Button } from "../components/Button";
import { Segmented } from "../components/Toggle";
import { DATA } from "../lib/city";
import { km2 } from "../lib/data";
import { usePopover } from "../lib/usePopover";
import type { CityRef, Summary } from "../lib/types";

type Props = {
  cities: CityRef[];
  sums: Record<string, Summary>; // every city's summary, for the picker
  city: Summary;
  onCity: (id: string) => void;
  years: string[];
  year: string;
  onYear: (y: string) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  onCopy: () => void;
  area: boolean; // is "Map your own area" open
  onArea: () => void;
};

const Chevron = () => <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>;

export function Toolbar(p: Props) {
  const picker = usePopover<HTMLDivElement>();
  const dl = usePopover<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [y0, y1] = p.years;
  const shown = p.cities.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const base = `${DATA}${p.city.id}/`;
  const dlYear = p.compare ? y1 : p.year;
  return (
    <div className="toolbar" role="toolbar" aria-label="Map tools">
      <div className="tb-group pop-anchor" ref={picker.ref}>
        <button type="button" className="combo" aria-haspopup="listbox" aria-expanded={picker.open} onClick={() => picker.setOpen(!picker.open)}>
          <span className="sw" style={{ backgroundImage: `url(${base}${p.city.files.overlay[y1]})` }} />
          <span>{p.city.name}</span><span className="sub">tile {p.city.tile}</span><Chevron />
        </button>
        <div className="pop" data-open={picker.open} role="dialog" aria-label="Choose a city">
          <input type="search" placeholder="Find a city" aria-label="Find a city" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          <div role="listbox" aria-label="Cities">
            {shown.map((c, i) => {
              const s = p.sums[c.id];
              return (
                <button key={c.id} type="button" role="option" className="opt" aria-selected={c.id === p.city.id}
                  onClick={() => { picker.setOpen(false); p.onCity(c.id); }}>
                  <span className="sw" style={{ backgroundImage: s ? `url(${DATA}${c.id}/${s.files.overlay[y1]})` : undefined }} />
                  <span><b>{c.name}</b>{s && <small>{km2(s.changed_km2)} km² reported change · {s.n_patches.toLocaleString("en-US")} squares</small>}</span>
                  <span className="k">{i + 1}</span>
                </button>
              );
            })}
            {!shown.length && <p className="empty-line">No city matches.</p>}
          </div>
        </div>
      </div>
      <span className="tb-sep" />
      <div className="tb-group">
        {p.compare
          ? <span className="tb-compare-label">{y0} | {y1}</span>
          : <Segmented label="Year" value={p.year} onChange={p.onYear} options={p.years.map((y) => ({ value: y, label: y }))} />}
        <button type="button" className="toggle-chip" aria-pressed={p.compare} onClick={() => p.onCompare(!p.compare)} title="Compare years (C)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 2v12" /><path d="m5 5-3 3 3 3M11 5l3 3-3 3" strokeLinejoin="round" /></svg>
          <span>Compare</span>
        </button>
      </div>
      <div className="tb-group tb-right">
        <button type="button" className="toggle-chip tb-hide-phone" aria-pressed={p.area} onClick={p.onArea} title="Map your own area" aria-label="Map your own area">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h10v10H3z" strokeDasharray="2.4 2" /><path d="M8 5.5v5M5.5 8h5" /></svg>
          <span>Map your area</span>
        </button>
        <div className="pop-anchor tb-hide-phone" ref={dl.ref}>
          <button type="button" className="toggle-chip" aria-expanded={dl.open} onClick={() => dl.setOpen(!dl.open)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10" /></svg>
            <span>Download</span>
          </button>
          <div className="pop pop-right" data-open={dl.open} role="menu">
            {[
              ["GeoTIFF", p.city.files.geotiff[dlYear], `Land-use classes, ${dlYear}, with map coordinates`],
              ["PNG map", p.city.files.map_png[dlYear], `Picture of the ${dlYear} map`],
              ["CSV", p.city.files.patches_csv, "Every square, both years"],
            ].map(([name, file, text]) => (
              <a key={name} className="opt opt-dl" role="menuitem" href={base + file} download>
                <span><b>{name}</b><small>{text}</small></span><span className="k">{file}</span>
              </a>
            ))}
          </div>
        </div>
        <span className="tb-hide-phone"><Button size="sm" onClick={p.onCopy}>Copy link</Button></span>
      </div>
    </div>
  );
}
