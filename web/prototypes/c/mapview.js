// Map view for direction C: pick a city (the camera flies there), pick a year (cross-fade), hover a 640 m patch.
import { loadAll, loadCity, LABEL, km2, pct } from "../shared/data.js";
import { createMap, cityBounds, reducedMotion } from "./map.js";
import { initTheme } from "./theme.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const phone = () => innerWidth <= 900;
const OVERLAY = 0.6;

const d = await loadAll();
const [y0, y1] = d.index.years;
let city = d.city;
let year = y1;
$$("[data-y0]").forEach((el) => (el.textContent = y0));
$$("[data-y1]").forEach((el) => (el.textContent = y1));
$$("[data-rate]").forEach((el) => (el.textContent = pct(d.check.final.real_rate, 0)));

const padding = () =>
  phone() ? { top: 70, bottom: innerHeight * 0.46 + 16, left: 16, right: 16 } : { top: 90, bottom: 40, left: 420, right: 40 };
const camFor = (c) => ({ ...map.cameraForBounds(cityBounds(c), { padding: padding() }), pitch: 0, bearing: 0 });

const map = createMap($("#map"), city, d.index.years, {
  interactive: true, center: [72.55, 23.02], zoom: 9, shownYear: year, overlayOpacity: OVERLAY,
});
initTheme($("#theme"), () => {
  map.applyTheme();
  if (map.getLayer("patch-hover")) map.setPaintProperty("patch-hover", "line-color", getComputedStyle(document.documentElement).getPropertyValue("--ink").trim());
});

// Segmented controls
$("#cities").innerHTML = d.index.cities
  .map((c) => `<button type="button" data-city="${c.id}" aria-pressed="${c.id === city.id}">${c.name}</button>`)
  .join("");
$("#years").innerHTML = d.index.years
  .map((y) => `<button type="button" data-y="${y}" aria-pressed="${y === year}">${y}</button>`)
  .join("");

$("#years").addEventListener("click", (e) => {
  const y = e.target.dataset.y;
  if (!y) return;
  year = y;
  map.showYear(y, OVERLAY);
  $$("#years button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.y === y)));
});

$("#cities").addEventListener("click", async (e) => {
  const id = e.target.closest("button")?.dataset.city;
  if (!id || id === city.id) return;
  $$("#cities button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.city === id)));
  city = await loadCity(id);
  map.setCity(city);
  map.getSource("patches").setData(city.base + city.summary.files.patches_geojson);
  const cam = camFor(city);
  if (reducedMotion()) map.jumpTo(cam);
  else map.flyTo({ ...cam, duration: 2400, curve: 1.3, essential: true });
  renderPanel();
});

function renderPanel() {
  const a0 = city.summary.areas_km2[y0], a1 = city.summary.areas_km2[y1];
  $("#legend").innerHTML = d.index.classes
    .map((c) => `<li><span class="sw" style="background:${c.colour}"></span><span>${LABEL[c.name]}</span>
      <span class="v">${km2(a0[c.name])} → <b>${km2(a1[c.name])}</b></span></li>`)
    .join("");
  $("#changes").innerHTML = city.summary.changes
    .slice(0, 5)
    .map((c) => `<li><span>${LABEL[c.from]} → ${LABEL[c.to]}</span><span>${km2(c.km2)} km²</span></li>`)
    .join("");
  const f = city.summary.files;
  $("#downloads").innerHTML = [
    ["GeoTIFF", f.geotiff[year]], ["PNG", f.map_png[year]], ["CSV", f.patches_csv],
  ]
    .map(([name, file]) => `<a class="btn small ghost" href="${city.base}${file}" download>${name}</a>`)
    .join("");
}
renderPanel();
$("#years").addEventListener("click", renderPanel);

// Hover a patch: an invisible fill layer from patches.geojson, loaded after the map so it doesn't slow the start.
const tip = $("#tip");
map.on("load", () => {
  map.jumpTo(camFor(city));
  map.addSource("patches", { type: "geojson", data: city.base + city.summary.files.patches_geojson });
  map.addLayer({ id: "patch-hit", type: "fill", source: "patches", paint: { "fill-opacity": 0 } });
  map.addLayer({
    id: "patch-hover", type: "line", source: "patches", filter: ["==", ["get", "id"], -1],
    paint: { "line-color": getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(), "line-width": 2 },
  });
  map.on("mousemove", "patch-hit", (e) => {
    const p = e.features[0].properties;
    map.setFilter("patch-hover", ["==", ["get", "id"], p.id]);
    tip.hidden = false;
    // Keep the box on screen: flip it to the left of the pointer near the right edge.
    tip.style.left = `${e.point.x > innerWidth - 240 ? e.point.x - 230 : e.point.x}px`;
    tip.style.top = `${e.point.y}px`;
    tip.innerHTML = `<b>${LABEL[p[`class_${year}`]]}</b><span>${pct(p[`confidence_${year}`], 0)}% sure · ${year}</span><br>
      <span>${p.changed ? `Changed: ${LABEL[p[`class_${y0}`]]} → ${LABEL[p[`class_${y1}`]]}` : "No change reported"}</span>`;
  });
  map.on("mouseleave", "patch-hit", () => {
    map.setFilter("patch-hover", ["==", ["get", "id"], -1]);
    tip.hidden = true;
  });
});
