// The Story page (step 5.3c), the site's front page: a map that stays on screen while chapter cards scroll over it
// (ported from prototype E). Each chapter moves the map (camera, layers). The map code (TerraMap + maplibre-gl) is
// downloaded after the page shows, so the page itself stays small.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { cityBounds, DATA, loadCity } from "../lib/city";
import { className } from "../lib/classes";
import { useJson } from "../lib/data";
import { reducedMotion } from "../lib/motion";
import { pinFor, topShifts, type StoryData } from "../lib/story";
import type { Checks, City, Index } from "../lib/types";
import type { TerraMap } from "../map/TerraMap";
import { CHAPTERS, EuropeIndia, Hero, HowSure, Limits, TheCity, WhatChanged, WhatItSees, type Ctx } from "../story/Chapters";
import "../story/Story.css";

const phone = () => innerWidth <= 960;
const GLOBE = { center: [62, 16] as [number, number], zoom: () => (phone() ? 0.35 : 1.75) };

export function Story() {
  const index = useJson<Index>(`${DATA}index.json`);
  const story = useJson<StoryData>(`${DATA}story.json`);
  const checks = useJson<Checks>(`${DATA}ahmedabad/checks.json`);
  const [city, setCity] = useState<City | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  useEffect(() => {
    if (index.data) loadCity("ahmedabad", index.data.years).then(setCity).catch((e: Error) => setCityError(e.message));
  }, [index.data]);
  useEffect(() => { document.title = "TerraScan: how much of Ahmedabad really changed?"; }, []);

  const error = index.error ?? story.error ?? checks.error ?? cityError;
  if (error) return <><SiteHeader page="story" /><p className="page-msg" role="alert">{error}</p></>;
  if (!index.data || !story.data || !checks.data || !city) return <><SiteHeader page="story" /><p className="page-msg">Loading…</p></>;
  return <StoryView index={index.data} story={story.data} checks={checks.data} city={city} />;
}

// One chapter = what the map shows while that card is on screen. 0 = the hero (globe).
type Scene = { cam: "globe" | "city" | "region"; pitch?: number; bearing?: number; landuse?: boolean; changes?: boolean; checks?: boolean; confidence?: boolean; pins?: boolean };
const SCENES: Scene[] = [
  { cam: "globe" },
  { cam: "city", pitch: 35, bearing: -12 },
  { cam: "city", landuse: true },
  { cam: "city", pitch: 30, bearing: 10, changes: true, pins: true },
  { cam: "city", changes: true, checks: true },
  { cam: "region" },
  { cam: "city", landuse: true, confidence: true },
];

function StoryView({ index, story, checks, city }: { index: Index; story: StoryData; checks: Checks; city: City }) {
  const years = index.years;
  const colour = useMemo(() => Object.fromEntries(index.classes.map((c) => [c.name, c.colour])), [index]);
  const [active, setActive] = useState(0); // the chapter on screen now
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const [ready, setReady] = useState(false); // map loaded
  const mapEl = useRef<HTMLDivElement>(null);
  const stepsEl = useRef<HTMLDivElement>(null);
  const tm = useRef<TerraMap | null>(null);
  const pins = useRef<{ addTo: (m: unknown) => void; remove: () => void }[]>([]);
  const motion = !reducedMotion();

  // ---------- Camera ----------
  // The hero's globe sits to the right of the text (desktop) or above it (phone); chapters fit the city into the
  // part of the screen the cards don't cover.
  const heroPad = () => (phone() ? { top: 40, bottom: Math.round(innerHeight * 0.62), left: 0, right: 0 } : { left: Math.round(innerWidth * 0.42), right: 0, top: 0, bottom: 0 });
  const cardPad = () => (phone() ? { top: 70, bottom: Math.round(innerHeight * 0.5), left: 12, right: 12 } : { top: 90, bottom: 60, left: Math.min(560, Math.round(innerWidth * 0.4)), right: 80 });
  const camFor = useCallback((sc: Scene) => {
    const m = tm.current!.map;
    if (sc.cam === "globe") return { center: GLOBE.center, zoom: GLOBE.zoom(), pitch: 0, bearing: 0, padding: heroPad() };
    if (sc.cam === "region") return { center: [44, 34] as [number, number], zoom: phone() ? 1.0 : 2.0, pitch: 0, bearing: 0, padding: phone() ? { top: 0, bottom: Math.round(innerHeight * 0.45), left: 0, right: 0 } : { left: Math.min(560, Math.round(innerWidth * 0.4)), right: 0, top: 0, bottom: 0 } };
    const pitch = sc.pitch ?? 0, bearing = sc.bearing ?? 0, padding = cardPad();
    // absolutePadding: this padding replaces the hero's instead of adding to it; pitch and bearing are included so a
    // tilted city still fits.
    const cam = m.cameraForBounds(cityBounds(city.summary), { padding, absolutePadding: true, pitch, bearing });
    return { center: cam?.center ?? [0, 0], zoom: (cam?.zoom ?? 10) - 0.08, pitch, bearing, padding };
  }, [city]);

  // ---------- Make the map (once) ----------
  useEffect(() => {
    let cancelled = false;
    import("../map/TerraMap").then(({ TerraMap, maplibregl }) => {
      if (cancelled || !mapEl.current) return;
      const t = new TerraMap(mapEl.current, {
        base: city.base, summary: city.summary, classes: index.classes, years, year: years[1],
        center: GLOBE.center, zoom: GLOBE.zoom(), interactive: false,
      });
      tm.current = t;
      t.map.setPadding(heroPad());
      // Pins for the two biggest shifts (chapter 3), made once and only shown or hidden.
      pins.current = topShifts(city.summary.changes).top.slice(0, 2).flatMap((s) => {
        const p = pinFor(city.patches, years, s);
        if (!p) return [];
        const el = document.createElement("div");
        el.className = "note-pin";
        const dot = document.createElement("i"), label = document.createElement("span");
        label.textContent = `${className(s.from).plain} → ${className(s.to).plain}`;
        el.append(dot, label);
        return [new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat])];
      }) as typeof pins.current;
      t.map.on("load", () => {
        t.setChecks(checks.squares);
        setReady(true);
        // Phones: show the map credits folded into their "i" button (MapLibre folds them after the first touch, but
        // this map can't be touched). One tap opens them.
        if (phone()) mapEl.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      });
    });
    return () => { cancelled = true; tm.current?.remove(); tm.current = null; };
    // Made once; chapters change it through the effects below.
  }, []);

  // ---------- Chapters: which card is on screen ----------
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const k = Number((e.target as HTMLElement).dataset.step);
        setActive(k);
        setSeen((s) => (s.has(k) ? s : new Set(s).add(k)));
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    stepsEl.current?.querySelectorAll(".step").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Move the map for the chapter on screen.
  const shown = useRef(-1);
  useEffect(() => {
    const t = tm.current;
    if (!ready || !t || shown.current === active) return;
    const prev = shown.current;
    shown.current = active;
    const sc = SCENES[active];
    t.showYear(years[1]);
    t.setLanduse({ on: !!sc.landuse, confidence: !!sc.confidence });
    t.setVisible("changes", !!sc.changes);
    t.setVisible("checks", !!sc.checks);
    t.focusChange(null, null);
    t.highlight("selected", null);
    pins.current.forEach((p) => (sc.pins ? p.addTo(t.map) : p.remove()));
    const cam = camFor(sc);
    if (reducedMotion()) t.map.jumpTo(cam);
    else {
      // Long flights (globe <-> city) get more time than moves within the city.
      const far = prev === -1 || [prev, active].some((k) => SCENES[k].cam !== "city");
      t.map.flyTo({ ...cam, duration: far ? 3600 : 2000, curve: 1.35, essential: true });
    }
  }, [ready, active, camFor, years]);

  // A gentle globe spin while the hero is on screen (not with reduced motion; paused while the tab is hidden).
  useEffect(() => {
    if (!ready || active !== 0 || reducedMotion()) return;
    let raf = 0;
    const m = tm.current!.map;
    const start = window.setTimeout(() => {
      const step = () => {
        if (!document.hidden && !m.isMoving()) { const c = m.getCenter(); m.setCenter([c.lng + 0.035, c.lat]); }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, 3700); // after the flight back to the globe
    return () => { clearTimeout(start); cancelAnimationFrame(raf); };
  }, [ready, active]);

  // ---------- Scroll: progress bar (phone) and the "Scroll" cue ----------
  const progress = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      lastScroll.current = performance.now();
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const h = stepsEl.current?.offsetHeight ?? 1;
        progress.current?.style.setProperty("--p", String(Math.min(1, Math.max(0, scrollY / (h - innerHeight)))));
        if (cue.current) cue.current.style.opacity = scrollY > 40 ? "0" : "1";
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  // Pointing at things in the cards. Ignored for a moment after each scroll: when the page scrolls under a still
  // mouse the browser sends "pointer moved" events, and each would redraw the map for nothing (step 5.3a traces).
  const calm = () => performance.now() - lastScroll.current > 150;
  const ctx: Ctx = {
    city, story, checks, years, colour,
    on: (n) => active === n,
    seen: (n) => seen.has(n),
    onSquare: (id) => { if (id === null || calm()) tm.current?.highlight("selected", id); },
    onShift: (s) => { if (s === null || calm()) tm.current?.focusChange(s?.from ?? null, s?.to ?? null); },
  };

  return (
    <div className={motion ? "story-page motion" : "story-page"}>
      <SiteHeader page="story" />
      <div className="progress" ref={progress} aria-hidden="true" />
      <main>
        <section className="story" aria-label="Story">
          <div className="story-map"><div className="map" ref={mapEl} role="img" aria-label="Map that follows the story: globe, then Ahmedabad and its land use" /></div>
          <div className="steps" ref={stepsEl}>
            <Hero ctx={ctx} />
            <TheCity ctx={ctx} />
            <WhatItSees ctx={ctx} />
            <WhatChanged ctx={ctx} />
            <HowSure ctx={ctx} />
            <EuropeIndia ctx={ctx} />
            <Limits ctx={ctx} />
          </div>
        </section>
      </main>
      <nav className="rail" aria-label="Chapters" data-show={active > 0}>
        {CHAPTERS.map((label, k) => (
          <a key={label} href={`#c${k + 1}`} aria-current={active === k + 1 ? "step" : undefined}><span>{label}</span><i /></a>
        ))}
      </nav>
      <div className="scroll-cue" ref={cue} aria-hidden="true"><span>Scroll</span><i /></div>
    </div>
  );
}
