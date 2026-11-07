// The map (MapLibre GL), ported from prototype E's geo.js. This file and maplibre-gl are only downloaded when a map
// is shown (the Explorer imports it with import()), so they don't count towards the page's first-load JavaScript.
//
// Layers, bottom to top:
//   earth      NASA Blue Marble tiles from NASA GIBS (free public service, no key; credited in the attribution)
//   borders    country outlines from MapLibre's free demo tiles, very faint
//   rgb<year>  the city's Sentinel-2 picture for each year (our files)
//   landuse<year>  the model's class for every 640 m square (patches.geojson), one layer per year so years cross-fade
//   changes    only the squares the model says changed
//   checks     the 50 squares checked by eye (checks.json, Ahmedabad only)
//   hit / hover / selected   invisible layer for the mouse, and outlines for the hovered and the chosen square
//   livergb / livefill / livehit / livehover / livesel / livebox   "Map your own area": the box the person drew and,
//                  once the server has answered, its picture, the model's classes, and the hover/chosen square
import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, ImageSource, LayerSpecification, SourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre draws in a background worker. Vite copies the worker file into the build (?url) and we tell MapLibre
// where it is; without this the map stays empty ("Worker failed to load").
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { ClassInfo, Summary } from "../lib/types";

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const WORLD = "https://demotiles.maplibre.org/tiles/tiles.json";
const FADE = { duration: 500, delay: 0 };
type GeoJsonData = Parameters<GeoJSONSource["setData"]>[0];
const EMPTY = { type: "FeatureCollection", features: [] } as const;
const CHANGED: ExpressionSpecification = ["==", ["get", "changed"], true];
// Layers that switch on and off fade in and out, and are switched off completely once hidden (a hidden layer at
// opacity 0 still cost time on every frame; measured in step 5.3a).
const SHOWN: Record<string, Record<string, number>> = {
  changes: { "fill-opacity": 0.9 },
  "changes-line": { "line-opacity": 0.8 },
  checks: { "circle-opacity": 1, "circle-stroke-opacity": 1 },
};

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => document.documentElement.dataset.theme === "dark";
const sky = () => ({
  "sky-color": isDark() ? "#05070a" : token("--space-bg"),
  "horizon-color": isDark() ? "#2d5f96" : "#cfe0f0",
  "fog-color": isDark() ? "#05070a" : token("--space-bg"),
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.9,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0] as ExpressionSpecification,
});

// Colour of a class in a given year: a "match" expression built from index.json's class colours.
const classColour = (classes: ClassInfo[], year: string) =>
  ["match", ["get", `class_${year}`], ...classes.flatMap((c) => [c.name, c.colour]), "#000000"] as unknown as ExpressionSpecification;

export type MapOptions = {
  base: string; // e.g. "/data/ahmedabad/"
  summary: Summary;
  classes: ClassInfo[];
  years: string[];
  year: string;
  center: [number, number];
  zoom: number;
  interactive?: boolean;
  landuseOpacity?: number;
};

export class TerraMap {
  map: maplibregl.Map;
  private years: string[];
  private hideTimers: Record<string, number> = {};
  private landuse = { year: "", opacity: 0.6, on: true, classes: null as string[] | null, confidence: false };
  private classes: ClassInfo[];

  constructor(container: HTMLElement, o: MapOptions) {
    this.years = o.years;
    this.classes = o.classes;
    this.landuse.year = o.year;
    this.landuse.opacity = o.landuseOpacity ?? 0.6;
    const sources: Record<string, SourceSpecification> = {
      earth: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8, attribution: "Globe: NASA Blue Marble · NASA GIBS" },
      world: { type: "vector", url: WORLD },
      patches: { type: "geojson", data: o.base + o.summary.files.patches_geojson, promoteId: "id" },
      checks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      livepatches: { type: "geojson", data: EMPTY, promoteId: "id" },
      livebox: { type: "geojson", data: EMPTY },
    };
    const layers: LayerSpecification[] = [
      { id: "space", type: "background", paint: { "background-color": isDark() ? "#05070a" : token("--space-bg") } },
      // Blue Marble is sharp only up to zoom 8; near a city it fades back so our sharp 10 m picture stands out.
      { id: "earth", type: "raster", source: "earth", paint: { "raster-fade-duration": 200, "raster-saturation": -0.1, "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6, 1, 9.5, 0.38] } },
      { id: "borders", type: "line", source: "world", "source-layer": "countries", paint: { "line-color": "#ffffff", "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.18, 6, 0.3, 9, 0], "line-width": 0.6 } },
    ];
    const corners = o.summary.overlay_corners as [[number, number], [number, number], [number, number], [number, number]];
    for (const y of o.years) {
      sources[`rgb${y}`] = { type: "image", url: o.base + o.summary.files.rgb[y], coordinates: corners };
      layers.push({ id: `rgb${y}`, type: "raster", source: `rgb${y}`, paint: { "raster-opacity": y === o.year ? 1 : 0, "raster-fade-duration": 0, "raster-opacity-transition": FADE } });
    }
    for (const y of o.years) {
      layers.push({ id: `landuse${y}`, type: "fill", source: "patches", paint: { "fill-color": classColour(o.classes, y), "fill-opacity": y === o.year ? this.landuse.opacity : 0, "fill-opacity-transition": FADE, "fill-antialias": false } });
    }
    layers.push(
      { id: "changes", type: "fill", source: "patches", filter: CHANGED, layout: { visibility: "none" }, paint: { "fill-color": classColour(o.classes, o.years[1]), "fill-opacity": 0, "fill-opacity-transition": FADE } },
      { id: "changes-line", type: "line", source: "patches", filter: CHANGED, layout: { visibility: "none" }, paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0, "line-opacity-transition": FADE } },
      { id: "checks", type: "circle", source: "checks", layout: { visibility: "none" }, paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 9],
        "circle-color": ["match", ["get", "verdict"], "yes", "#ffb224", "no", "#ffffff", "#8a949b"],
        "circle-stroke-color": "#11151a", "circle-stroke-width": 1.5,
        "circle-opacity": 0, "circle-stroke-opacity": 0, "circle-opacity-transition": FADE, "circle-stroke-opacity-transition": FADE,
      } },
      { id: "hit", type: "fill", source: "patches", paint: { "fill-color": "#000000", "fill-opacity": 0 } },
      { id: "hover", type: "line", source: "patches", filter: ["==", ["id"], -1], paint: { "line-color": "#ffffff", "line-width": 1.5 } },
      { id: "selected", type: "line", source: "patches", filter: ["==", ["id"], -1], paint: { "line-color": "#ffb224", "line-width": 2.5 } },
      // "Map your own area" (the picture, livergb, is added when a result arrives, just below livefill)
      { id: "livefill", type: "fill", source: "livepatches", layout: { visibility: "none" }, paint: { "fill-color": "#000000", "fill-opacity": 0.6, "fill-antialias": false } },
      { id: "livehit", type: "fill", source: "livepatches", layout: { visibility: "none" }, paint: { "fill-color": "#000000", "fill-opacity": 0 } },
      { id: "livehover", type: "line", source: "livepatches", filter: ["==", ["id"], -1], paint: { "line-color": "#ffffff", "line-width": 1.5 } },
      { id: "livesel", type: "line", source: "livepatches", filter: ["==", ["id"], -1], paint: { "line-color": "#ffb224", "line-width": 2.5 } },
      { id: "livebox", type: "line", source: "livebox", paint: { "line-color": "#ffb224", "line-width": 2.5, "line-dasharray": [2, 1.5] } },
    );
    this.map = new maplibregl.Map({
      container,
      // Phones have 3x screens; drawing the map at 2x looks the same and is less than half the work.
      pixelRatio: Math.min(devicePixelRatio || 1, 2),
      style: { version: 8, projection: { type: "globe" }, sky: sky(), sources, layers },
      center: o.center,
      zoom: o.zoom,
      interactive: o.interactive ?? true,
      attributionControl: { compact: true, customAttribution: "City images: modified Copernicus Sentinel-2 data" },
      fadeDuration: 150,
    });
    // A mouse wheel zooms a little gentler than MapLibre's default (1/450), so the globe and the city don't jump.
    // It always zooms towards the pointer.
    this.map.scrollZoom.setWheelZoomRate(1 / 600);
  }

  private landuseOpacity(y: string): number | ExpressionSpecification {
    const l = this.landuse;
    if (!l.on || y !== l.year) return 0;
    return l.confidence
      ? ["interpolate", ["linear"], ["get", `confidence_${y}`], 0.3, l.opacity * 0.12, 0.95, Math.min(1, l.opacity * 1.25)]
      : l.opacity;
  }

  private refreshLanduse() {
    for (const y of this.years) {
      this.map.setPaintProperty(`landuse${y}`, "fill-opacity", this.landuseOpacity(y));
      this.map.setFilter(`landuse${y}`, this.landuse.classes ? ["in", ["get", `class_${y}`], ["literal", this.landuse.classes]] : null);
    }
  }

  showYear(y: string) {
    this.landuse.year = y;
    for (const yy of this.years) this.map.setPaintProperty(`rgb${yy}`, "raster-opacity", yy === y ? 1 : 0);
    this.refreshLanduse();
  }

  setLanduse(o: { on?: boolean; opacity?: number; classes?: string[] | null; confidence?: boolean }) {
    Object.assign(this.landuse, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
    this.refreshLanduse();
  }

  setSatellite(on: boolean) {
    for (const y of this.years) this.map.setLayoutProperty(`rgb${y}`, "visibility", on ? "visible" : "none");
  }

  // Fade in: switch the layer on, then raise its opacity. Fade out: lower it, then switch the layer off.
  setVisible(id: "changes" | "checks", on: boolean) {
    for (const l of [id, `${id}-line`]) {
      if (!this.map.getLayer(l)) continue;
      clearTimeout(this.hideTimers[l]);
      if (on) this.map.setLayoutProperty(l, "visibility", "visible");
      for (const [prop, v] of Object.entries(SHOWN[l] ?? {})) this.map.setPaintProperty(l, prop as Parameters<maplibregl.Map["setPaintProperty"]>[1], on ? v : 0);
      if (!on) this.hideTimers[l] = window.setTimeout(() => this.map.setLayoutProperty(l, "visibility", "none"), FADE.duration + 50);
    }
  }

  // Show only the changed squares that went from class `from` to class `to` (null = all changes).
  focusChange(from: string | null, to: string | null) {
    const [y0, y1] = this.years;
    const f: FilterSpecification = from && to ? ["all", CHANGED, ["==", ["get", `class_${y0}`], from] as ExpressionSpecification, ["==", ["get", `class_${y1}`], to] as ExpressionSpecification] : CHANGED;
    this.map.setFilter("changes", f);
    this.map.setFilter("changes-line", f);
  }

  setChecks(points: { id: number; lon: number; lat: number; verdict: string }[]) {
    (this.map.getSource("checks") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: points.map((p) => ({ type: "Feature", id: p.id, properties: { verdict: p.verdict }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
    });
  }

  highlight(layer: "hover" | "selected", id: number | null) {
    this.map.setFilter(layer, ["==", ["id"], id ?? -1]);
  }

  setCity(base: string, summary: Summary) {
    const corners = summary.overlay_corners as [[number, number], [number, number], [number, number], [number, number]];
    for (const y of this.years) (this.map.getSource(`rgb${y}`) as ImageSource).updateImage({ url: base + summary.files.rgb[y], coordinates: corners });
    (this.map.getSource("patches") as GeoJSONSource).setData(base + summary.files.patches_geojson);
  }

  // ---------- Map your own area ----------
  // The box the person drew (null = remove it).
  setBox(b: [number, number, number, number] | null) {
    const [w, so, e, n] = b ?? [0, 0, 0, 0];
    (this.map.getSource("livebox") as GeoJSONSource).setData(b
      ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[w, so], [e, so], [e, n], [w, n], [w, so]]] } }
      : EMPTY);
  }

  // Show the server's answer: its picture, the model's class for every square, and a mouse target for each square.
  // While it is shown the showcase city's own mouse target is switched off, so hovering reads the live squares.
  showLive(live: { corners: [number, number][]; rgbUrl: string; patches: { type: "FeatureCollection"; features: unknown[] }; year: string }) {
    this.clearLive();
    const corners = live.corners as [[number, number], [number, number], [number, number], [number, number]];
    this.map.addSource("livergb", { type: "image", url: live.rgbUrl, coordinates: corners });
    this.map.addLayer({ id: "livergb", type: "raster", source: "livergb", paint: { "raster-fade-duration": 0 } }, "livefill");
    (this.map.getSource("livepatches") as GeoJSONSource).setData(live.patches as unknown as GeoJsonData);
    this.map.setPaintProperty("livefill", "fill-color", classColour(this.classes, live.year));
    this.map.setPaintProperty("livefill", "fill-opacity", this.landuse.opacity);
    for (const l of ["livefill", "livehit"]) this.map.setLayoutProperty(l, "visibility", "visible");
    this.map.setFilter("hit", ["==", ["id"], -1]);
  }

  clearLive() {
    if (this.map.getLayer("livergb")) this.map.removeLayer("livergb");
    if (this.map.getSource("livergb")) this.map.removeSource("livergb");
    (this.map.getSource("livepatches") as GeoJSONSource).setData(EMPTY as unknown as GeoJsonData);
    for (const l of ["livefill", "livehit"]) this.map.setLayoutProperty(l, "visibility", "none");
    this.highlightLive("livehover", null);
    this.highlightLive("livesel", null);
    this.map.setFilter("hit", null);
  }

  highlightLive(layer: "livehover" | "livesel", id: number | null) {
    this.map.setFilter(layer, ["==", ["id"], id ?? -1]);
  }

  applyTheme() {
    if (!this.map.getLayer("space")) return;
    this.map.setPaintProperty("space", "background-color", isDark() ? "#05070a" : token("--space-bg"));
    this.map.setSky(sky());
  }

  remove() {
    Object.values(this.hideTimers).forEach(clearTimeout);
    this.map.remove();
  }
}
