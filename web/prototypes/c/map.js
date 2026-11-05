// MapLibre map for direction C: a plain globe (country shapes from MapLibre's free demo tiles) with one city's
// satellite image and land-use overlay placed on it, for each year. Colours come from the CSS theme tokens.
import * as maplibregl from "../../node_modules/maplibre-gl/dist/maplibre-gl.mjs";

const WORLD = "https://demotiles.maplibre.org/tiles/tiles.json";
const FADE = 600; // ms, year cross-fade

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function imageSource(city, file) {
  return { type: "image", url: city.base + file, coordinates: city.summary.overlay_corners };
}

export function cityBounds(city) {
  const c = city.summary.overlay_corners;
  const lngs = c.map((p) => p[0]), lats = c.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

export function createMap(container, city, years, { interactive, center, zoom, shownYear, overlayOpacity }) {
  const sources = { world: { type: "vector", url: WORLD } };
  const layers = [
    { id: "ocean", type: "background", paint: { "background-color": token("--map-ocean") } },
    { id: "land", type: "fill", source: "world", "source-layer": "countries", paint: { "fill-color": token("--map-land") } },
    {
      id: "borders", type: "line", source: "world", "source-layer": "countries",
      paint: { "line-color": token("--map-border"), "line-width": 0.7 },
    },
  ];
  for (const y of years) {
    sources[`rgb${y}`] = imageSource(city, city.summary.files.rgb[y]);
    sources[`ov${y}`] = imageSource(city, city.summary.files.overlay[y]);
    const on = y === shownYear;
    layers.push(
      {
        id: `rgb${y}`, type: "raster", source: `rgb${y}`,
        paint: { "raster-opacity": on ? 1 : 0, "raster-fade-duration": 0, "raster-opacity-transition": { duration: FADE } },
      },
      {
        id: `ov${y}`, type: "raster", source: `ov${y}`,
        paint: {
          "raster-opacity": on ? overlayOpacity : 0, "raster-resampling": "nearest", "raster-fade-duration": 0,
          "raster-opacity-transition": { duration: FADE },
        },
      },
    );
  }

  const map = new maplibregl.Map({
    container,
    style: { version: 8, projection: { type: "globe" }, sources, layers },
    center, zoom, interactive,
    attributionControl: { compact: true, customAttribution: "Contains modified Copernicus Sentinel-2 data" },
  });

  // Start the credit collapsed (an "i" button); it opens on click.
  map.once("load", () => container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));

  // Show one year (cross-fade). overlay = opacity of the land-use colours for that year.
  map.showYear = (year, overlay = overlayOpacity) => {
    for (const y of years) {
      map.setPaintProperty(`rgb${y}`, "raster-opacity", y === year ? 1 : 0);
      map.setPaintProperty(`ov${y}`, "raster-opacity", y === year ? overlay : 0);
    }
  };
  // Re-read the theme tokens after the light/dark switch.
  map.applyTheme = () => {
    if (!map.getLayer("ocean")) return; // style not ready yet; it was built with the current colours anyway
    map.setPaintProperty("ocean", "background-color", token("--map-ocean"));
    map.setPaintProperty("land", "fill-color", token("--map-land"));
    map.setPaintProperty("borders", "line-color", token("--map-border"));
  };
  // Swap in another city's images (same layers).
  map.setCity = (next) => {
    for (const y of years) {
      map.getSource(`rgb${y}`).updateImage({ url: next.base + next.summary.files.rgb[y], coordinates: next.summary.overlay_corners });
      map.getSource(`ov${y}`).updateImage({ url: next.base + next.summary.files.overlay[y], coordinates: next.summary.overlay_corners });
    }
  };
  return map;
}
