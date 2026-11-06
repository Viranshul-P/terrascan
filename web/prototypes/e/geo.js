// Map module for prototype E (MapLibre GL 6). One style, used by the Story and the Explorer:
//   earth     NASA Blue Marble tiles from NASA GIBS (public service, no key; acknowledgement shown in the credits)
//   borders   country outlines from MapLibre's free demo tiles, very faint
//   rgb<year> the city's Sentinel-2 picture for each year (our files)
//   landuse   the model's class for every 640 m square, drawn from patches.geojson (so it can be filtered,
//             hovered and shaded by confidence), one layer per year so years can cross-fade
//   changes   only the squares the model says changed
//   checks    the 50 squares that were checked by eye (results/change_check_*.csv)
import * as maplibregl from "../../node_modules/maplibre-gl/dist/maplibre-gl.mjs";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const WORLD = "https://demotiles.maplibre.org/tiles/tiles.json";
const FADE = { duration: 500, delay: 0 };
// Layers that switch on and off fade in and out (opacity), and are switched off completely once hidden.
const SHOWN = {
  changes: { "fill-opacity": 0.9 },
  "changes-line": { "line-opacity": 0.8 },
  checks: { "circle-opacity": 1, "circle-stroke-opacity": 1 },
};
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => document.documentElement.dataset.theme === "dark";

export function cityBounds(city) {
  const c = city.summary.overlay_corners;
  const lngs = c.map((p) => p[0]), lats = c.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
export const cityCenter = (city) => {
  const [[a, b], [c, d]] = cityBounds(city);
  return [(a + c) / 2, (b + d) / 2];
};

function sky() {
  const dark = isDark();
  return {
    "sky-color": dark ? "#05070a" : token("--space-bg"),
    "horizon-color": dark ? "#2d5f96" : "#cfe0f0",
    "fog-color": dark ? "#05070a" : token("--space-bg"),
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0.9,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
  };
}

// Colour of a class for a given year: a "match" expression built from index.json's class colours.
export const classColour = (classes, year) => [
  "match", ["get", `class_${year}`], ...classes.flatMap((c) => [c.name, c.colour]), "#000000",
];

const CHANGED = ["==", ["get", "changed"], true];

export function createMap(container, { city, classes, years, year, interactive = true, center, zoom, landuseOpacity = 0.55 }) {
  const sources = {
    earth: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8, attribution: "Globe: NASA Blue Marble · NASA GIBS" },
    world: { type: "vector", url: WORLD },
    patches: { type: "geojson", data: city.base + city.summary.files.patches_geojson, promoteId: "id" },
    checks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  };
  const layers = [
    { id: "space", type: "background", paint: { "background-color": isDark() ? "#05070a" : token("--space-bg") } },
    // Blue Marble is sharp only up to zoom 8; near a city it fades back so our sharp 10 m picture stands out.
    { id: "earth", type: "raster", source: "earth",
      paint: { "raster-fade-duration": 200, "raster-saturation": -0.1, "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6, 1, 9.5, 0.38] } },
    { id: "borders", type: "line", source: "world", "source-layer": "countries",
      paint: { "line-color": "#ffffff", "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.18, 6, 0.3, 9, 0], "line-width": 0.6 } },
  ];
  for (const y of years) {
    sources[`rgb${y}`] = { type: "image", url: city.base + city.summary.files.rgb[y], coordinates: city.summary.overlay_corners };
    layers.push({ id: `rgb${y}`, type: "raster", source: `rgb${y}`,
      paint: { "raster-opacity": y === year ? 1 : 0, "raster-fade-duration": 0, "raster-opacity-transition": FADE } });
  }
  for (const y of years) {
    layers.push({ id: `landuse${y}`, type: "fill", source: "patches",
      paint: { "fill-color": classColour(classes, y), "fill-opacity": y === year ? landuseOpacity : 0, "fill-opacity-transition": FADE, "fill-antialias": false } });
  }
  layers.push(
    { id: "changes", type: "fill", source: "patches", filter: CHANGED, layout: { visibility: "none" },
      paint: { "fill-color": classColour(classes, years[1]), "fill-opacity": 0, "fill-opacity-transition": FADE } },
    { id: "changes-line", type: "line", source: "patches", filter: CHANGED, layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0, "line-opacity-transition": FADE } },
    { id: "checks", type: "circle", source: "checks", layout: { visibility: "none" },
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 9],
        "circle-color": ["match", ["get", "verdict"], "yes", "#ffb224", "no", "#ffffff", "#8a949b"],
        "circle-stroke-color": "#11151a",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0, "circle-stroke-opacity": 0, "circle-opacity-transition": FADE, "circle-stroke-opacity-transition": FADE,
      } },
    // One checked square, picked from the story's waffle chart: a ring around it.
    { id: "checks-hl", type: "circle", source: "checks", filter: ["==", ["id"], -1],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 11, 13, 18], "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffb224", "circle-stroke-width": 3 } },
    { id: "hit", type: "fill", source: "patches", paint: { "fill-color": "#000000", "fill-opacity": 0 } },
    { id: "hover", type: "line", source: "patches", filter: ["==", ["id"], -1], paint: { "line-color": "#ffffff", "line-width": 1.5 } },
    { id: "selected", type: "line", source: "patches", filter: ["==", ["id"], -1], paint: { "line-color": "#ffb224", "line-width": 2.5 } },
  );

  const map = new maplibregl.Map({
    container,
    // Phones have 3x screens; drawing the map at 2x looks the same and is less than half the work.
    pixelRatio: Math.min(devicePixelRatio || 1, 2),
    style: { version: 8, projection: { type: "globe" }, sky: sky(), sources, layers },
    center, zoom, interactive,
    attributionControl: { compact: true, customAttribution: "City images: modified Copernicus Sentinel-2 data" },
    fadeDuration: 150,
  });

  const hideTimers = {};
  const state = { year, landuseOpacity, landuseOn: true, classes: null, confidence: false };
  const landuseOpacityExpr = (y) => {
    if (!state.landuseOn || y !== state.year) return 0;
    return state.confidence
      ? ["interpolate", ["linear"], ["get", `confidence_${y}`], 0.3, state.landuseOpacity * 0.12, 0.95, state.landuseOpacity * 1.25]
      : state.landuseOpacity;
  };
  const refreshLanduse = () => {
    for (const y of years) {
      map.setPaintProperty(`landuse${y}`, "fill-opacity", landuseOpacityExpr(y));
      map.setFilter(`landuse${y}`, state.classes ? ["in", ["get", `class_${y}`], ["literal", state.classes]] : null);
    }
  };

  Object.assign(map, {
    state,
    showYear(y) {
      state.year = y;
      for (const yy of years) map.setPaintProperty(`rgb${yy}`, "raster-opacity", yy === y ? 1 : 0);
      refreshLanduse();
    },
    setLanduse({ on, opacity, classes: only, confidence } = {}) {
      if (on !== undefined) state.landuseOn = on;
      if (opacity !== undefined) state.landuseOpacity = opacity;
      if (only !== undefined) state.classes = only;
      if (confidence !== undefined) state.confidence = confidence;
      refreshLanduse();
    },
    setSatellite(on) { for (const y of years) map.setLayoutProperty(`rgb${y}`, "visibility", on ? "visible" : "none"); },
    // Fade in: switch the layer on, then raise its opacity. Fade out: lower the opacity, then switch it off once
    // the fade is over, so a hidden layer costs nothing while the map moves.
    setVisible(id, on) {
      for (const l of [id, `${id}-line`]) {
        if (!map.getLayer(l)) continue;
        clearTimeout(hideTimers[l]);
        if (on) map.setLayoutProperty(l, "visibility", "visible");
        for (const [prop, v] of Object.entries(SHOWN[l] ?? {})) map.setPaintProperty(l, prop, on ? v : 0);
        if (!on) hideTimers[l] = setTimeout(() => map.setLayoutProperty(l, "visibility", "none"), FADE.duration + 50);
      }
    },
    // Show only the changed squares that went from class `from` to class `to` (null = all changes).
    focusChange(from, to) {
      const f = from ? ["all", CHANGED, ["==", ["get", `class_${years[0]}`], from], ["==", ["get", `class_${years[1]}`], to]] : CHANGED;
      map.setFilter("changes", f);
      map.setFilter("changes-line", f);
    },
    setChecks(features) { map.getSource("checks").setData({ type: "FeatureCollection", features }); },
    highlight(layer, id) { map.setFilter(layer, ["==", ["id"], id ?? -1]); },
    setCity(next) {
      for (const y of years) map.getSource(`rgb${y}`).updateImage({ url: next.base + next.summary.files.rgb[y], coordinates: next.summary.overlay_corners });
      map.getSource("patches").setData(next.base + next.summary.files.patches_geojson);
    },
    applyTheme() {
      if (!map.getLayer("space")) return;
      map.setPaintProperty("space", "background-color", isDark() ? "#05070a" : token("--space-bg"));
      map.setSky(sky());
    },
  });
  map.once("load", () => container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
  return map;
}

export { maplibregl };
