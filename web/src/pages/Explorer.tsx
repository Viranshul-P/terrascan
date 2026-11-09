// The Explorer (step 5.3b): the map of a showcase city with the model's land use for two years.
// State lives in the URL (?city=&year=&sq=&compare=1), so any view can be shared. The map code (TerraMap +
// maplibre-gl, ~430 KB) is downloaded after the page shows, so the page itself stays small.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { AreaPanel } from "../explorer/AreaPanel";
import { DrawLayer } from "../explorer/DrawLayer";
import { Inspector } from "../explorer/Inspector";
import { LayersPanel, type Layers, type Pair } from "../explorer/LayersPanel";
import { GLOBE, playOpening, type EndCamera } from "../explorer/opening";
import { Toolbar } from "../explorer/Toolbar";
import { useAreaMap } from "../explorer/useAreaMap";
import { ViewControls } from "../explorer/ViewControls";
import { cityBounds, DATA, loadCity } from "../lib/city";
import { className } from "../lib/classes";
import { getJson, pct, useJson } from "../lib/data";
import { reducedMotion } from "../lib/motion";
import { modelNote, type StoryData } from "../lib/story";
import { snapPx, type Snap } from "../lib/sheet";
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
  const [panel, setPanel] = useState(!phone()); // desktop: is the layers panel open
  const [layersSnap, setLayersSnap] = useState<Snap>("peek"); // phone: height of the layers sheet
  const [inspSnap, setInspSnap] = useState<Snap>("half"); // phone: height of the square sheet
  const [areaSnap, setAreaSnap] = useState<Snap>("half"); // phone: height of the "map your own area" sheet
  const story = useJson<StoryData>(`${DATA}story.json`);
  const area = useAreaMap(years);
  const [picked, setPicked] = useState<{ id: number; cls: string; conf: number } | null>(null); // tapped square of a live map
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
  const live = useRef({ compare, year, city, areaYear: area.year });
  live.current = { compare, year, city, areaYear: area.result?.year ?? area.year };

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
  // On a phone the sheet sits over the bottom of the map, so the city is fitted into the part above it (never more
  // than half the map, even when the sheet is tall).
  const areaOpen = area.mode !== "off";
  const sheetNow = areaOpen ? areaSnap : sel !== null ? inspSnap : layersSnap;
  const pad = useCallback(() => phone()
    ? { top: 40, bottom: Math.min(snapPx(sheetNow, stage.current?.clientHeight ?? 700), (stage.current?.clientHeight ?? 700) / 2) + 16, left: 16, right: 16 }
    : { top: 40, bottom: 70, left: panel ? 340 : 40, right: 360 }, [panel, sheetNow]);
  // The whole city, looking straight down, north up, in the middle of the space between the panels. (The 3D
  // button in the zoom bar tilts it.)
  const fitCam = useCallback((): EndCamera => {
    const m = tm.current!.map;
    const cam = m.cameraForBounds(cityBounds(live.current.city!.summary), { padding: pad(), pitch: 0, bearing: 0 });
    // cameraForBounds already shifts the centre for the panels, so the camera itself gets no padding.
    return { center: cam?.center, zoom: cam?.zoom ?? 10, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
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
          playOpening(m, fitCam(), () => setIntro(false));
        } else m.jumpTo(fitCam());
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
      // The squares of a live map ("map your own area"): the label on hover, the details when tapped. The class
      // names come from the server, so the label is built from text, never from HTML.
      let liveId: number | null = null;
      m.on("mousemove", "livehit", (e) => {
        const f = e.features?.[0];
        if (!f || f.id === undefined || !tip.current) return;
        pt = e.point;
        if (f.id !== liveId) {
          liveId = Number(f.id);
          t.highlightLive("livehover", liveId);
          m.getCanvas().style.cursor = "pointer";
          const pr = f.properties as Record<string, string | number>, y = live.current.areaYear, cls = String(pr[`class_${y}`]);
          const dot = document.createElement("i"), conf = document.createElement("span");
          dot.style.background = colour[cls] ?? "#888";
          conf.textContent = `${pct(Number(pr[`confidence_${y}`]), 0)}% sure`;
          tip.current.replaceChildren(dot, className(cls).plain, conf);
          tip.current.hidden = false;
        }
        raf ||= requestAnimationFrame(() => { raf = 0; if (tip.current) tip.current.style.transform = `translate(${pt.x + 14}px, ${pt.y}px) translateY(-50%)`; });
      });
      m.on("mouseleave", "livehit", () => { liveId = null; t.highlightLive("livehover", null); if (tip.current) tip.current.hidden = true; m.getCanvas().style.cursor = ""; });
      m.on("click", "livehit", (e) => {
        const f = e.features?.[0];
        if (!f || f.id === undefined) return;
        const pr = f.properties as Record<string, string | number>, y = live.current.areaYear;
        setPicked({ id: Number(f.id), cls: String(pr[`class_${y}`]), conf: Number(pr[`confidence_${y}`]) });
      });
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

  // A tapped square opens the sheet at half height; the map moves so the square stays visible above it. When the
  // sheet closes the map moves back (only if it had been moved).
  useEffect(() => { if (sel !== null) setInspSnap("half"); }, [sel]);
  useEffect(() => {
    if (!ready || intro || !phone() || !tm.current) return;
    const m = tm.current.map;
    const area = stage.current!.clientHeight;
    const bottom = sel !== null ? Math.min(snapPx(inspSnap, area), area / 2) : 0;
    if (Math.round(m.getPadding().bottom ?? 0) === Math.round(bottom)) return;
    const to = { top: 0, left: 0, right: 0, bottom };
    const p = sel !== null ? city?.patches[sel] : null;
    m.easeTo({ ...(p ? { center: [p.lon, p.lat] as [number, number] } : {}), padding: to, duration: reducedMotion() ? 0 : 400, essential: true });
  }, [ready, intro, sel, inspSnap, city]);

  // ---------- Map your own area ----------
  // Opening the tool: flatten the map (a drawn box is only a true lon/lat box on a flat, north-up map), turn compare
  // off (the second map would hide the live layers), and drop the chosen square.
  const openArea = useCallback(() => {
    setCompare(false); setSel(null); setAreaSnap("half");
    const m = tm.current?.map;
    if (m && (m.getPitch() || m.getBearing())) m.easeTo({ pitch: 0, bearing: 0, duration: reducedMotion() ? 0 : 500, essential: true });
    area.open();
  }, [area.open]);
  // While the tool is open the map cannot be turned or tilted (a drawn box must stay a true lon/lat box).
  useEffect(() => {
    const m = tm.current?.map;
    if (!ready || !m) return;
    if (areaOpen) { m.dragRotate.disable(); m.touchZoomRotate.disableRotation(); m.touchPitch.disable(); m.keyboard.disableRotation(); }
    else { m.dragRotate.enable(); m.touchZoomRotate.enableRotation(); m.touchPitch.enable(); m.keyboard.enableRotation(); }
  }, [ready, areaOpen]);
  const toggleArea = () => (area.mode === "off" ? openArea() : area.close());
  const middleBox = useCallback(() => {
    // A box in the middle of the part of the map that can be seen (on a phone the sheet covers the bottom), 60% of
    // the shorter side: the same box a drag would make.
    const m = tm.current?.map;
    if (!m) return;
    const c = m.getCanvas().getBoundingClientRect();
    const seen = phone() ? c.height - Math.min(snapPx(areaSnap, c.height), c.height / 2) : c.height;
    const side = Math.min(c.width, seen) * 0.6;
    const a = { x: c.width / 2 - side / 2, y: seen / 2 - side / 2 }, b = { x: a.x + side, y: a.y + side };
    const sw = m.unproject([a.x, b.y]), ne = m.unproject([b.x, a.y]);
    area.setBox([sw.lng, sw.lat, ne.lng, ne.lat]);
  }, [area.setBox, areaSnap]);
  useEffect(() => { if (ready) tm.current?.setBox(area.bbox); }, [ready, area.bbox]);
  useEffect(() => {
    if (!ready || !tm.current) return;
    setPicked(null);
    const r = area.result;
    if (r) tm.current.showLive({ corners: r.map.overlay_corners, rgbUrl: r.map.files.rgb[r.year], patches: r.map.patches_geojson, year: r.year });
    else tm.current.clearLive();
  }, [ready, area.result]);
  useEffect(() => { if (ready) tm.current?.highlightLive("livesel", picked?.id ?? null); }, [ready, picked]);

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
      const cam = fitCam();
      reducedMotion() ? tm.current?.map.jumpTo(cam) : tm.current?.map.flyTo({ ...cam, duration: 2200, curve: 1.4, essential: true });
    } catch (e) { setError((e as Error).message); }
  }, [city, years, fitCam]);

  const showToast = (msg: string, ms = 2200) => { setToast(msg); window.setTimeout(() => setToast(null), ms); };
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
      if (areaOpen) { if (e.key === "Escape") area.close(); return; } // while mapping an area, only Esc (closes it)
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const i = years.indexOf(year) + (e.key === "ArrowRight" ? 1 : -1);
        if (years[i] && !compare) setYear(years[i]);
      } else if (/^[1-9]$/.test(e.key) && index.cities[Number(e.key) - 1]) switchCity(index.cities[Number(e.key) - 1].id);
      else if (e.key.toLowerCase() === "c") setCompare((v) => !v);
      else if (e.key === "Escape") setSel(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [years, year, compare, index, switchCity, areaOpen, area.close]);

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
          compare={compare} onCompare={(v) => { if (v) area.close(); setCompare(v); }} onCopy={copyLink} area={areaOpen} onArea={toggleArea} />
        <div className="stage" ref={stage} data-compare={compare} data-inspect={sel !== null || areaOpen} data-sheet={intro ? "none" : sheetNow} style={{ "--split": `${split}%` } as CSSProperties}>
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
          {!intro && <p className="model-note" role="note">{modelNote(story.data?.india ?? null)}</p>}
          <div className="tip" ref={tip} hidden />
          {area.mode === "draw" && <DrawLayer map={() => tm.current?.map ?? null} maxKm={area.limits.max_side_km} onBox={area.setBox} onCancel={area.close} />}
          {!ready && <div className="map-loading" role="status"><span className="spinner" />Loading the map…</div>}
          {intro && <button type="button" className="skip" onClick={() => setIntro(false)}>Skip intro</button>}

          <LayersPanel layers={layers} setLayers={setLayers} hidden={phone() ? sel !== null || areaOpen || intro : !panel || intro} onHide={() => setPanel(false)} snap={layersSnap} onSnap={setLayersSnap} onArea={openArea}
            legendTitle={compare ? `Land use, ${y0} → ${y1}` : `Land use, ${legendYear}`}
            legend={index.classes.map((c) => ({ key: c.name, colour: c.colour, value: s.areas_km2[legendYear][c.name], delta: s.areas_km2[legendYear][c.name] - s.areas_km2[otherYear][c.name] }))}
            active={only} onToggleClass={toggleClass} onShowAll={() => setOnly(null)} onPreview={(k) => setPreview(only ? null : k)}
            changes={s.changes.slice(0, 5)} changedPatches={s.changed_patches} pair={pair} onPair={setPair}
            checksCount={city.id === "ahmedabad" && checks ? checks.squares.length : null} summaryFile={`web/public/data/${city.id}/summary.json`} />
          {!panel && !intro && !phone() && (
            <button type="button" className="panel-open" onClick={() => setPanel(true)} aria-label="Show layers panel">Layers</button>
          )}
          <Inspector city={city} years={years} colour={colour} sel={sel} verdict={sel !== null ? verdicts[sel] : undefined}
            hidden={intro || areaOpen || (phone() && sel === null)} modelName={index.model}
            onClose={() => setSel(null)} onCopy={copyLink} snap={inspSnap} onSnap={setInspSnap}
            onZoom={() => { const p = city.patches[sel!]; tm.current?.map.flyTo({ center: [p.lon, p.lat], zoom: 14, pitch: 0, duration: reducedMotion() ? 0 : 1400, essential: true }); }} />

          <AreaPanel area={area} years={years} classes={index.classes} picked={picked} hidden={intro || !areaOpen} snap={areaSnap} onSnap={setAreaSnap} onMiddle={middleBox} />

          <div className="status"><span ref={cursor}>—</span><span>zoom <b ref={zoomVal}>—</b></span><span title={`Sentinel-2 tile ${s.tile}`}>10 m Sentinel-2</span></div>
          <div className="zoombar">
            <button type="button" aria-label="Zoom in" onClick={() => tm.current?.map.zoomIn()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></button>
            <button type="button" aria-label="Zoom out" onClick={() => tm.current?.map.zoomOut()}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 8h10" /></svg></button>
            <button type="button" aria-label="Fit the city, flat and north up" title="Fit the city, flat and north up" onClick={() => tm.current?.map.flyTo({ ...fitCam(), duration: reducedMotion() ? 0 : 1200, essential: true })}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg></button>
            <ViewControls map={ready ? tm.current?.map ?? null : null} disabled={areaOpen}
              onTilt={(on) => on && showToast(phone() ? "Tip: drag with two fingers to turn and tilt" : "Tip: right-drag or Ctrl + drag to turn and tilt", 3500)} />
          </div>
        </div>
      </div>
      <div className="toast" role="status" data-show={!!toast}>{toast}</div>
    </div>
  );
}
