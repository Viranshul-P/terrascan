// The Explorer (step 5.3b): the map of a showcase city with the model's land use for two years.
// State lives in the URL (?city=&year=&sq=&compare=1), so any view can be shared. The map code (TerraMap +
// maplibre-gl, ~430 KB) is downloaded after the page shows, so the page itself stays small.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { Inspector } from "../explorer/Inspector";
import { LayersPanel, type Layers, type Pair } from "../explorer/LayersPanel";
import { GLOBE, playOpening, type EndCamera } from "../explorer/opening";
import { Toolbar } from "../explorer/Toolbar";
import { cityBounds, DATA, loadCity } from "../lib/city";
import { className } from "../lib/classes";
import { getJson, pct, useJson } from "../lib/data";
import { reducedMotion } from "../lib/motion";
import type { Checks, City, Index, Summary } from "../lib/types";
import type { TerraMap } from "../map/TerraMap";
import "../explorer/Explorer.css";

const phone = () => innerWidth <= 960;
const params = new URLSearchParams(location.search);
const FRESH = !location.search; // a plain visit gets the globe opening; a shared link opens on its view

export function Explorer() {
  const index = useJson<Index>(`${DATA}index.json`);
  if (index.error) return <><SiteHeader page="explorer" /><p className="page-msg" role="alert">{index.error}</p></>;
  if (!index.data) return <><SiteHeader page="explorer" /><p className="page-msg">Loading…</p></>;
  return <ExplorerView index={index.data} />;
}

function ExplorerView({ index }: { index: Index }) {
  const years = index.years;
  const [y0, y1] = years;
  const colour = useMemo(() => Object.fromEntries(index.classes.map((c) => [c.name, c.colour])), [index]);
  const startCity = index.cities.some((c) => c.id === params.get("city")) ? params.get("city")! : index.cities[0].id;

  const [city, setCity] = useState<City | null>(null);
  const [sums, setSums] = useState<Record<string, Summary>>({});
  const [checks, setChecks] = useState<Checks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(years.includes(params.get("year") ?? "") ? params.get("year")! : y1);
  const [compare, setCompare] = useState(params.get("compare") === "1");
  const [sel, setSel] = useState<number | null>(params.has("sq") ? Number(params.get("sq")) : null);
  const [layers, setLayers] = useState<Layers>({ sat: true, land: true, opacity: 0.6, conf: false, change: false, checks: false });
  const [only, setOnly] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pair, setPair] = useState<Pair>(null);
  const [split, setSplit] = useState(50);
  const [panel, setPanel] = useState(!phone());
  const [intro, setIntro] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapBEl = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const zoomVal = useRef<HTMLElement>(null);
  const tm = useRef<TerraMap | null>(null);
  const tmB = useRef<TerraMap | null>(null);
  const [ready, setReady] = useState(false); // map style loaded
  // Map event handlers read the latest state through this ref (they are attached once).
  const live = useRef({ compare, year, city });
  live.current = { compare, year, city };

  // ---------- Data ----------
  useEffect(() => {
    let alive = true;
    loadCity(city?.id ?? startCity, years).then((c) => alive && setCity(c)).catch((e: Error) => setError(e.message));
    return () => { alive = false; };
    // Only the first city is loaded here; switching cities goes through switchCity.
  }, []);
  useEffect(() => {
    Promise.all(index.cities.map((c) => getJson<Summary>(DATA + c.summary)))
      .then((all) => setSums(Object.fromEntries(all.map((s) => [s.id, s]))))
      .catch(() => { /* the picker then shows names only */ });
    getJson<Checks>(`${DATA}ahmedabad/checks.json`).then(setChecks).catch(() => setChecks(null));
  }, [index]);

  // ---------- Camera ----------
  const pad = useCallback(() => phone()
    ? { top: 40, bottom: 40, left: 16, right: 16 }
    : { top: 40, bottom: 70, left: panel ? 340 : 40, right: 360 }, [panel]);
  const fitCam = useCallback((tilt: boolean): EndCamera => {
    const m = tm.current!.map;
    const pitch = tilt ? 50 : 0, bearing = tilt ? -14 : 0;
    const cam = m.cameraForBounds(cityBounds(live.current.city!.summary), { padding: pad(), pitch, bearing });
    // cameraForBounds already shifts the centre for the panels, so the camera itself gets no padding. A tilted
    // fit comes out cautious (the far edge looks small), so the tilted end zooms in a little more.
    return { center: cam?.center, zoom: (cam?.zoom ?? 10) + (tilt ? 0.35 : 0), pitch, bearing, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
  }, [pad]);

  // ---------- Create the map (once the first city is loaded) ----------
  useEffect(() => {
    if (!city || tm.current) return;
    let cancelled = false;
    import("../map/TerraMap").then(({ TerraMap }) => {
      if (cancelled || !mapEl.current) return;
      const t = new TerraMap(mapEl.current, {
        base: city.base, summary: city.summary, classes: index.classes, years, year,
        center: GLOBE.center as [number, number], zoom: phone() ? 0.6 : GLOBE.zoom!,
      });
      tm.current = t;
      const m = t.map;
      m.on("load", () => {
        if (checks) t.setChecks(checks.squares);
        setReady(true);
        if (FRESH && !reducedMotion()) {
          setIntro(true);
          playOpening(m, fitCam(true), () => setIntro(false));
        } else m.jumpTo(fitCam(false));
      });
      // Hover label: text and outline change only when the pointer moves to another square; the label is moved with
      // a transform once per frame.
      let tipId: number | null = null, raf = 0, pt = { x: 0, y: 0 };
      m.on("mousemove", "hit", (e) => {
        const f = e.features?.[0];
        if (!f || f.id === undefined || !tip.current) return;
        pt = e.point;
        if (f.id !== tipId) {
          tipId = Number(f.id);
          t.highlight("hover", tipId);
          m.getCanvas().style.cursor = "pointer";
          const pr = f.properties as Record<string, string | number>;
          const { compare: cmp, year: yr } = live.current;
          const name = (y: string) => className(String(pr[`class_${y}`])).plain;
          tip.current.innerHTML = cmp
            ? `<i style="background:${colour[String(pr[`class_${y0}`])]}"></i>${name(y0)} → <i style="background:${colour[String(pr[`class_${y1}`])]}"></i>${name(y1)}`
            : `<i style="background:${colour[String(pr[`class_${yr}`])]}"></i>${name(yr)}<span>${pct(Number(pr[`confidence_${yr}`]), 0)}% sure</span>`;
          tip.current.hidden = false;
        }
        raf ||= requestAnimationFrame(() => { raf = 0; if (tip.current) tip.current.style.transform = `translate(${pt.x + 14}px, ${pt.y}px) translateY(-50%)`; });
      });
      m.on("mouseleave", "hit", () => { tipId = null; t.highlight("hover", null); if (tip.current) tip.current.hidden = true; m.getCanvas().style.cursor = ""; });
      m.on("click", "hit", (e) => { const id = e.features?.[0]?.id; if (id !== undefined) setSel(Number(id)); });
      let cr = 0, ll = { lng: 0, lat: 0 };
      m.on("mousemove", (e) => {
        ll = e.lngLat;
        cr ||= requestAnimationFrame(() => { cr = 0; if (cursor.current) cursor.current.textContent = `${ll.lat.toFixed(4)}° N  ${ll.lng.toFixed(4)}° E`; });
      });
      m.on("zoom", () => { if (zoomVal.current) zoomVal.current.textContent = m.getZoom().toFixed(1); });
      m.on("move", () => tmB.current?.map.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() }));
    });
    return () => { cancelled = true; };
    // The map is made once; later changes are applied by the effects below.
  }, [city]);
  useEffect(() => () => { tm.current?.remove(); tmB.current?.remove(); }, []);

  // ---------- Keep the map in step with the state ----------
  const apply = useCallback((t: TerraMap | null, isB = false) => {
    if (!t || !t.map.getLayer("space")) return;
    t.setSatellite(layers.sat);
    t.setLanduse({ on: layers.land && !layers.change, opacity: layers.opacity, confidence: layers.conf, classes: preview ? [preview] : only });
    t.setVisible("changes", layers.change);
    t.setVisible("checks", layers.checks && city?.id === "ahmedabad");
    t.focusChange(pair?.from ?? null, pair?.to ?? null);
    t.showYear(compare ? (isB ? y1 : y0) : year);
  }, [layers, only, preview, pair, compare, year, city, y0, y1]);
  useEffect(() => { if (ready) { apply(tm.current); apply(tmB.current, true); } }, [ready, apply]);
  useEffect(() => { if (ready) tm.current?.highlight("selected", sel); }, [ready, sel]);
  useEffect(() => { if (ready && checks) tm.current?.setChecks(checks.squares); }, [ready, checks]);

  // Compare: a second map, made the first time it is needed, synced to the first and clipped by the swipe handle.
  useEffect(() => {
    if (!compare || !ready || !city || tmB.current || !mapBEl.current) return;
    import("../map/TerraMap").then(({ TerraMap }) => {
      const m = tm.current!.map;
      const b = new TerraMap(mapBEl.current!, {
        base: city.base, summary: city.summary, classes: index.classes, years, year: y1, interactive: false,
        center: [m.getCenter().lng, m.getCenter().lat], zoom: m.getZoom(),
      });
      tmB.current = b;
      b.map.on("load", () => {
        b.map.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() });
        apply(b, true);
      });
    });
  }, [compare, ready, city, index, years, y1, apply]);

  // Theme switch: recolour the map's sky and background.
  useEffect(() => {
    const mo = new MutationObserver(() => { tm.current?.applyTheme(); tmB.current?.applyTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // ---------- URL ----------
  useEffect(() => {
    if (!city) return;
    const q = new URLSearchParams({ city: city.id, year });
    if (compare) q.set("compare", "1");
    if (sel !== null) q.set("sq", String(sel));
    history.replaceState(null, "", `?${q}`);
    document.title = `${city.summary.name} · Explorer · TerraScan`;
  }, [city, year, compare, sel]);

  // ---------- Actions ----------
  const switchCity = useCallback(async (id: string) => {
    if (id === city?.id) return;
    try {
      const next = await loadCity(id, years);
      setCity(next); setSel(null); setOnly(null); setPair(null);
      tm.current?.setCity(next.base, next.summary);
      tmB.current?.setCity(next.base, next.summary);
      live.current.city = next;
      const cam = fitCam(false);
      reducedMotion() ? tm.current?.map.jumpTo(cam) : tm.current?.map.flyTo({ ...cam, duration: 2200, curve: 1.4, essential: true });
    } catch (e) { setError((e as Error).message); }
  }, [city, years, fitCam]);

  const showToast = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2200); };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); showToast("Link copied: it opens this exact view"); }
    catch { showToast("Copy failed: copy the address bar instead"); }
  };
  const toggleClass = (k: string) => {
    const s = new Set(only ?? []);
    s.has(k) ? s.delete(k) : s.add(k);
    setOnly(s.size ? [...s] : null);
  };

  // Keyboard: arrows = year, 1-4 = city, C = compare, Esc = clear the chosen square.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [role=slider]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const i = years.indexOf(year) + (e.key === "ArrowRight" ? 1 : -1);
        if (years[i] && !compare) setYear(years[i]);
      } else if (/^[1-9]$/.test(e.key) && index.cities[Number(e.key) - 1]) switchCity(index.cities[Number(e.key) - 1].id);
      else if (e.key.toLowerCase() === "c") setCompare((v) => !v);
      else if (e.key === "Escape") setSel(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [years, year, compare, index, switchCity]);

  // Swipe handle: drag, or arrow keys when it has focus.
  const dragSplit = (e: PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    setSplit(Math.min(95, Math.max(5, ((e.clientX - r.left) / r.width) * 100)));
  };

  if (error) return <><SiteHeader page="explorer" /><p className="page-msg" role="alert">{error}</p></>;
  if (!city) return <><SiteHeader page="explorer" /><p className="page-msg">Loading the map…</p></>;
  const s = city.summary;
  const legendYear = compare ? y1 : year;
  const otherYear = legendYear === y1 ? y0 : y1;
  const verdicts = city.id === "ahmedabad" && checks ? Object.fromEntries(checks.squares.map((q) => [q.id, q.verdict])) : {};

  return (
    <div className="app">
      <SiteHeader page="explorer" />
      <div className="app-shell">
        <Toolbar cities={index.cities} sums={sums} city={s} onCity={switchCity} years={years} year={year} onYear={setYear}
          compare={compare} onCompare={setCompare} onCopy={copyLink} onLayers={() => setPanel((v) => !v)} />
        <div className="stage" ref={stage} data-compare={compare} data-inspect={sel !== null} style={{ "--split": `${split}%` } as CSSProperties}>
          <div className="map" ref={mapEl} role="region" aria-label={`Land-use map of ${s.name}`} />
          <div className="map-b" ref={mapBEl} aria-hidden="true" />
          {compare && <>
            <span className="yr-tag l">{y0}</span><span className="yr-tag r">{y1}</span>
            <div className="swipe" role="slider" tabIndex={0} aria-label={`Compare ${y0} and ${y1}: drag to reveal`} aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(split)}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragSplit(e); }}
              onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) dragSplit(e); }}
              onKeyDown={(e) => { if (e.key === "ArrowLeft") setSplit((v) => Math.max(5, v - 5)); if (e.key === "ArrowRight") setSplit((v) => Math.min(95, v + 5)); }}>
              <span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 4-4 4 4 4M10 4l4 4-4 4" /></svg></span>
            </div>
          </>}
          <div className="tip" ref={tip} hidden />
          {!ready && <div className="map-loading" role="status"><span className="spinner" />Loading the map…</div>}
          {intro && <button type="button" className="skip" onClick={() => setIntro(false)}>Skip intro</button>}

          <LayersPanel layers={layers} setLayers={setLayers} hidden={!panel || intro} onHide={() => setPanel(false)}
            legendTitle={compare ? `Land use, ${y0} → ${y1}` : `Land use, ${legendYear}`}
            legend={index.classes.map((c) => ({ key: c.name, colour: c.colour, value: s.areas_km2[legendYear][c.name], delta: s.areas_km2[legendYear][c.name] - s.areas_km2[otherYear][c.name] }))}
            active={only} onToggleClass={toggleClass} onShowAll={() => setOnly(null)} onPreview={(k) => setPreview(only ? null : k)}
            changes={s.changes.slice(0, 5)} changedPatches={s.changed_patches} pair={pair} onPair={setPair}
            checksCount={city.id === "ahmedabad" && checks ? checks.squares.length : null} summaryFile={`web/public/data/${city.id}/summary.json`} />
          {!panel && !intro && !phone() && (
            <button type="button" className="panel-open" onClick={() => setPanel(true)} aria-label="Show layers panel">Layers</button>
          )}
          <Inspector city={city} years={years} colour={colour} sel={sel} verdict={sel !== null ? verdicts[sel] : undefined}
            hidden={intro || (phone() && sel === null)} modelName={index.model}
            onClose={() => setSel(null)} onCopy={copyLink}
            onZoom={() => { const p = city.patches[sel!]; tm.current?.map.flyTo({ center: [p.lon, p.lat], zoom: 14, pitch: 0, duration: reducedMotion() ? 0 : 1400, essential: true }); }} />

          <div className="status"><span ref={cursor}>—</span><span>zoom <b ref={zoomVal}>—</b></span><span>{s.tile} · 10 m Sentinel-2</span></div>
          <div className="zoombar">
            <button type="button" aria-label="Zoom in" onClick={() => tm.current?.map.zoomIn()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></button>
            <button type="button" aria-label="Zoom out" onClick={() => tm.current?.map.zoomOut()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 8h10" /></svg></button>
            <button type="button" aria-label="Fit the city, flat" onClick={() => tm.current?.map.flyTo({ ...fitCam(false), duration: reducedMotion() ? 0 : 1200, essential: true })}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg></button>
          </div>
        </div>
      </div>
      <div className="toast" role="status" data-show={!!toast}>{toast}</div>
    </div>
  );
}
