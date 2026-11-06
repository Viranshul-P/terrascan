// Explorer (prototype E). State lives in the URL (?city=&year=&sq=&compare=1) so any view can be shared.
import { loadAll, loadCity, LABEL, km2, pct } from "../shared/data.js";
import { initShell, onThemeChange, reducedMotion, src } from "./shell.js";
import { createMap, cityBounds } from "./geo.js";

initShell({ page: "explorer" });
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const phone = () => innerWidth <= 960;
const params = new URLSearchParams(location.search);

const [d, sample, reviewed, api] = await Promise.all([
  loadAll(params.get("city") || "ahmedabad"),
  fetch("../../../results/change_check_sample.csv").then((r) => r.text()),
  fetch("../../../results/change_check_reviewed.csv").then((r) => r.text()),
  fetch("../../../results/api_check.json").then((r) => r.json()),
]);
const years = d.index.years;
const colour = Object.fromEntries(d.index.classes.map((k) => [k.name, k.colour]));
const parse = (t) => { const [h, ...rs] = t.trim().split("\n"); const k = h.split(","); return rs.map((r) => Object.fromEntries(r.split(",").map((v, i) => [k[i], v]))); };
const verdictByPair = Object.fromEntries(parse(reviewed).map((r) => [r.pair, r.final]));
const checkSample = parse(sample);

const state = {
  city: d.city,
  year: years.includes(params.get("year")) ? params.get("year") : years[1],
  compare: params.get("compare") === "1",
  sel: params.has("sq") ? Number(params.get("sq")) : null,
  classes: null,
};

// ---------- Map ----------
const panelPad = () => (phone() ? { top: 60, bottom: 60, left: 16, right: 16 } : { top: 40, bottom: 70, left: 300 + 40, right: (state.sel !== null ? 320 + 40 : 40) });
const fitCam = () => {
  const cam = map.cameraForBounds(cityBounds(state.city), { padding: panelPad(), absolutePadding: true });
  return { center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0 };
};
const map = createMap($("#map"), { city: state.city, classes: d.index.classes, years, year: state.year, center: [72.6, 22.6], zoom: 7, landuseOpacity: 0.6 });
let mapB = null;
onThemeChange(() => { map.applyTheme(); mapB?.applyTheme(); });

function checkFeatures() {
  if (state.city.id !== "ahmedabad") return [];
  return checkSample.map((p) => ({ type: "Feature", properties: { verdict: verdictByPair[p.pair] }, geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] } }));
}
const checkByPatch = () => {
  if (state.city.id !== "ahmedabad") return {};
  const cols = state.city.summary.grid_cols;
  return Object.fromEntries(checkSample.map((p) => [(Number(p.row) / 64) * cols + Number(p.col) / 64, verdictByPair[p.pair]]));
};

// ---------- Toolbar: city ----------
const cityBtn = $("#cityBtn"), cityPop = $("#cityPop");
function setPop(btn, pop, open) { btn.setAttribute("aria-expanded", String(open)); pop.dataset.open = String(open); }
cityBtn.addEventListener("click", (e) => { e.stopPropagation(); setPop(cityBtn, cityPop, cityPop.dataset.open !== "true"); if (cityPop.dataset.open === "true") $("#cityFilter").focus(); });
let sums = {};
Promise.all(d.index.cities.map((c) => fetch(`../../public/data/${c.summary}`).then((r) => r.json()))).then((all) => {
  all.forEach((s) => (sums[s.id] = s));
  renderCityList("");
});
function renderCityList(q) {
  $("#cityList").innerHTML = d.index.cities
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .map((c, i) => {
      const s = sums[c.id];
      return `<button class="opt" role="option" data-city="${c.id}" aria-selected="${c.id === state.city.id}">
        <span class="sw" style="background-image:url(../../public/data/${c.id}/${s.files.overlay[years[1]]})"></span>
        <span><b>${c.name}</b><small>${km2(s.changed_km2)} km² reported change · ${s.n_patches.toLocaleString("en-US")} squares</small></span><span class="k">${i + 1}</span></button>`;
    }).join("") || `<div class="empty" style="padding:16px">No city matches. Try “Map your own area”.</div>`;
}
$("#cityFilter").addEventListener("input", (e) => renderCityList(e.target.value));
$("#cityList").addEventListener("click", (e) => { const b = e.target.closest("[data-city]"); if (b) { setPop(cityBtn, cityPop, false); switchCity(b.dataset.city); } });

async function switchCity(id) {
  if (id === state.city.id) return;
  state.city = await loadCity(id);
  state.sel = null; state.classes = null;
  map.setCity(state.city);
  mapB?.setCity(state.city);
  map.setChecks(checkFeatures());
  renderAll();
  const cam = fitCam();
  reducedMotion() ? map.jumpTo(cam) : map.flyTo({ ...cam, duration: 2200, curve: 1.4, essential: true });
}

// ---------- Toolbar: years + compare ----------
$("#years").innerHTML = years.map((y) => `<button type="button" data-y="${y}">${y}</button>`).join("");
$("#years").addEventListener("click", (e) => e.target.dataset.y && setYear(e.target.dataset.y));
function setYear(y) {
  state.year = y;
  if (!state.compare) map.showYear(y);
  renderAll();
}
$("#compareBtn").addEventListener("click", () => setCompare(!state.compare));
function setCompare(on) {
  state.compare = on;
  $("#compareBtn").setAttribute("aria-pressed", String(on));
  $("#stage").dataset.compare = String(on);
  if (on) {
    if (!mapB) {
      mapB = createMap($("#mapB"), { city: state.city, classes: d.index.classes, years, year: years[1], interactive: false, center: map.getCenter(), zoom: map.getZoom() });
      mapB.on("load", () => { syncB(); applyLayers(mapB); mapB.showYear(years[1]); });
    } else { syncB(); applyLayers(mapB); mapB.showYear(years[1]); }
    map.showYear(years[0]);
  } else {
    map.showYear(state.year);
  }
  renderAll();
}
const syncB = () => mapB?.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
map.on("move", syncB);
$("#tagL").textContent = years[0]; $("#tagR").textContent = years[1];
// Swipe handle
let split = 50;
const setSplit = (v) => { split = Math.min(95, Math.max(5, v)); $("#stage").style.setProperty("--split", `${split}%`); $("#swipe").setAttribute("aria-valuenow", String(Math.round(split))); };
const sw = $("#swipe");
sw.addEventListener("pointerdown", (e) => sw.setPointerCapture(e.pointerId));
sw.addEventListener("pointermove", (e) => { if (sw.hasPointerCapture(e.pointerId)) { const r = $("#stage").getBoundingClientRect(); setSplit(((e.clientX - r.left) / r.width) * 100); } });
sw.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") setSplit(split - 5); if (e.key === "ArrowRight") setSplit(split + 5); });
setSplit(50);

// ---------- Layers panel ----------
const layerState = { sat: true, land: true, opacity: 0.6, conf: false, change: false, checks: false };
function applyLayers(m) {
  if (!m?.getLayer("space")) return;
  m.setSatellite(layerState.sat);
  m.setLanduse({ on: layerState.land && !layerState.change, opacity: layerState.opacity, confidence: layerState.conf, classes: state.classes });
  m.setVisible("changes", layerState.change);
  m.setVisible("checks", layerState.checks && state.city.id === "ahmedabad");
}
function bindSwitch(id, key) {
  const el = $(id);
  el.setAttribute("aria-checked", String(layerState[key]));
  el.addEventListener("click", () => {
    if (el.closest("[aria-disabled='true']")) return;
    layerState[key] = !layerState[key];
    el.setAttribute("aria-checked", String(layerState[key]));
    applyLayers(map); applyLayers(mapB);
  });
}
bindSwitch("#swSat", "sat"); bindSwitch("#swLand", "land"); bindSwitch("#swConf", "conf"); bindSwitch("#swChange", "change"); bindSwitch("#swChecks", "checks");
const opacity = $("#opacity");
const setOpacityUi = () => { opacity.style.setProperty("--v", `${opacity.value}%`); $("#opacityVal").textContent = `${opacity.value}%`; };
opacity.addEventListener("input", () => { layerState.opacity = opacity.value / 100; setOpacityUi(); applyLayers(map); applyLayers(mapB); });
setOpacityUi();

$("#legend").addEventListener("click", (e) => {
  const b = e.target.closest(".leg");
  if (!b) return;
  const k = b.dataset.k;
  const cur = new Set(state.classes ?? []);
  cur.has(k) ? cur.delete(k) : cur.add(k);
  state.classes = cur.size ? [...cur] : null;
  applyLayers(map); applyLayers(mapB); renderLegend();
});
// Pointing at a class shows only that class on the map, as a preview (clicking still filters for real).
const preview = (only) => { for (const m of [map, mapB]) if (m?.getLayer("space")) m.setLanduse({ classes: only ?? state.classes }); };
$("#legend").addEventListener("pointerover", (e) => { const b = e.target.closest(".leg"); if (b && !state.classes) preview([b.dataset.k]); });
$("#legend").addEventListener("pointerleave", () => preview(null));
$("#legReset").addEventListener("click", () => { state.classes = null; applyLayers(map); applyLayers(mapB); renderLegend(); });
$("#hideLayers").addEventListener("click", () => togglePanels());
$("#layersBtnPhone").addEventListener("click", () => {
  const hidden = $("#layersPanel").dataset.hidden !== "false";
  $("#layersPanel").dataset.hidden = String(!hidden);
  $("#layersBtnPhone").setAttribute("aria-pressed", String(hidden));
  if (hidden) $("#inspector").dataset.hidden = "true";
});
function togglePanels() {
  const p = $("#layersPanel");
  p.dataset.hidden = String(p.dataset.hidden !== "true");
}

function renderLegend() {
  const s = state.city.summary;
  const y = state.compare ? years[1] : state.year;
  const other = y === years[1] ? years[0] : years[1];
  $("#legYear").textContent = state.compare ? `${years[0]} → ${years[1]}` : y;
  $("#legend").dataset.filtered = String(!!state.classes);
  const max = Math.max(...d.index.classes.map((c) => s.areas_km2[y][c.name]));
  const old = Object.fromEntries($$("#legend .leg").map((b) => [b.dataset.k, b.style.getPropertyValue("--w")]));
  $("#legend").innerHTML = d.index.classes.map((c) => {
    const v = s.areas_km2[y][c.name], dv = v - s.areas_km2[other][c.name];
    const sign = dv > 0.5 ? "+" : dv < -0.5 ? "−" : "±";
    // --w: this class's share of the biggest class, drawn as a faint bar behind the row. It starts from the old
    // value so a city or year switch animates the bars to their new length.
    return `<button class="leg" data-k="${c.name}" style="--c:${c.colour};--w:${old[c.name] || 0}" data-w="${v / max}" aria-pressed="${!state.classes || state.classes.includes(c.name)}">
      <i></i><span>${LABEL[c.name]}</span><span class="v">${km2(v)}<em>${sign}${km2(Math.abs(dv))}</em></span></button>`;
  }).join("");
  requestAnimationFrame(() => requestAnimationFrame(() => $$("#legend .leg").forEach((b) => b.style.setProperty("--w", b.dataset.w))));
  $("#legReset").hidden = !state.classes;
  $("#legHint").textContent = state.classes ? `${state.classes.length} of ${d.index.classes.length} shown` : `Change vs ${other} in grey`;
}

// ---------- Inspector ----------
const SQUARE_ICON = `<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="10" height="10" rx="2"/><rect x="17" y="4" width="10" height="10" rx="2"/><rect x="30" y="4" width="10" height="10" rx="2"/><rect x="4" y="17" width="10" height="10" rx="2"/><rect x="17" y="17" width="10" height="10" rx="2" fill="currentColor" fill-opacity="0.25"/><rect x="30" y="17" width="10" height="10" rx="2"/><rect x="4" y="30" width="10" height="10" rx="2"/><rect x="17" y="30" width="10" height="10" rx="2"/><rect x="30" y="30" width="10" height="10" rx="2"/></svg>`;
function crop(y, id) {
  const s = state.city.summary, cols = s.grid_cols, rows = s.grid_rows;
  const r = Math.floor(id / cols), c = id % cols;
  return `background-image:url(${state.city.base}${s.files.rgb[y]});background-size:${cols * 100}% ${rows * 100}%;background-position:${(c / (cols - 1)) * 100}% ${(r / (rows - 1)) * 100}%`;
}
function renderInspector() {
  const el = $("#inspector");
  $("#stage").dataset.inspect = String(state.sel !== null);
  if (state.sel === null) {
    el.dataset.hidden = phone() ? "true" : "false";
    el.innerHTML = `<div class="empty">${SQUARE_ICON}<b>Pick a square</b>Click anywhere on the city to see what the model saw there, in both years.</div>`;
    return;
  }
  const p = state.city.patches[state.sel];
  const s = state.city.summary;
  const verdict = checkByPatch()[state.sel];
  el.dataset.hidden = "false";
  if (phone()) $("#layersPanel").dataset.hidden = "true";
  el.innerHTML = `
    <div class="p-head"><h2>Square <span class="mono">#${state.sel.toLocaleString("en-US")}</span></h2>
      <button class="icon-btn" id="closeInsp" aria-label="Close"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div>
    <div class="p-body">
      <div class="crops">${years.map((y) => `<div class="crop"><div class="px" style="--c:${colour[p[`class_${y}`]]};${crop(y, state.sel)}"></div><span>${y}</span></div>`).join("")}</div>
      <p class="crop-note">20 m preview of the 640 m square. The model saw it at 10 m.</p>
      <div style="margin-top:14px">${p.changed === "True" ? `<span class="verdict changed"><i></i>Reported change</span>` : `<span class="verdict same"><i></i>No change reported</span>`}</div>
      <div class="cls-rows">${years.map((y) => `<div class="cls" style="--c:${colour[p[`class_${y}`]]}"><span class="y">${y}</span>
        <div><div class="what"><span>${LABEL[p[`class_${y}`]]}</span><span>${pct(Number(p[`confidence_${y}`]), 0)}% sure</span></div>
        <div class="bar"><i style="--w:${Number(p[`confidence_${y}`]) * 100}%"></i></div></div></div>`).join("")}</div>
      ${verdict ? `<div class="checked-note">This square was in the hand check: <b>${{ yes: "real change", no: "not a real change", unclear: "unclear" }[verdict]}</b>.${src("results/change_check_reviewed.csv", "final", "Claude first, then reviewed by the author.")}</div>` : ""}
      <dl class="meta-list">
        <dt>Centre</dt><dd>${Number(p.lat).toFixed(4)}° N, ${Number(p.lon).toFixed(4)}° E</dd>
        <dt>Size</dt><dd>640 × 640 m</dd>
        <dt>Tile</dt><dd>${s.tile}</dd>
        <dt>Model</dt><dd>EfficientNet-B0 · seed 42</dd>
      </dl>
      <div class="insp-actions"><button class="btn btn-sm btn-quiet" id="zoomSq">Zoom to square</button><button class="btn btn-sm btn-ghost" id="copySq">Copy link</button></div>
    </div>`;
  $("#closeInsp").addEventListener("click", () => select(null));
  $("#zoomSq").addEventListener("click", () => map.flyTo({ center: [Number(p.lon), Number(p.lat)], zoom: 14, duration: reducedMotion() ? 0 : 1400, essential: true }));
  $("#copySq").addEventListener("click", copyLink);
}
function select(id) {
  state.sel = id;
  map.highlight("selected", id);
  renderInspector();
  writeUrl();
}

// ---------- Downloads, share, toast ----------
function renderDownloads() {
  const s = state.city.summary, b = state.city.base, y = state.compare ? years[1] : state.year;
  $("#dlPop").innerHTML = [
    ["GeoTIFF", s.files.geotiff[y], `Land-use classes, ${y}, map coordinates`],
    ["PNG map", s.files.map_png[y], `Picture of the ${y} map`],
    ["CSV", s.files.patches_csv, `Every square, both years`],
  ].map(([n, f, t]) => `<a class="opt" role="menuitem" href="${b}${f}" download style="grid-template-columns:1fr auto;text-decoration:none"><span><b>${n}</b><small>${t}</small></span><span class="k">${f}</span></a>`).join("");
}
const dlBtn = $("#dlBtn"), dlPop = $("#dlPop"), keysBtn = $("#keysBtn"), keysPop = $("#keysPop");
dlBtn.addEventListener("click", (e) => { e.stopPropagation(); setPop(dlBtn, dlPop, dlPop.dataset.open !== "true"); });
keysBtn.addEventListener("click", (e) => { e.stopPropagation(); setPop(keysBtn, keysPop, keysPop.dataset.open !== "true"); });
document.addEventListener("click", (e) => {
  for (const [b, p] of [[cityBtn, cityPop], [dlBtn, dlPop], [keysBtn, keysPop]]) if (!p.contains(e.target) && e.target !== b) setPop(b, p, false);
});
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.dataset.show = "true"; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.dataset.show = "false"), 2200); }
async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied: it opens this exact view"); } catch { toast("Copy failed: copy the address bar instead"); }
}
$("#shareBtn").addEventListener("click", copyLink);
function writeUrl() {
  const q = new URLSearchParams({ city: state.city.id, year: state.year });
  if (state.compare) q.set("compare", "1");
  if (state.sel !== null) q.set("sq", state.sel);
  history.replaceState(null, "", `?${q}`);
}

// ---------- Map your own area (the live API is not connected in this prototype) ----------
const own = { box: null, start: null };
const maxKm = api.health.max_side_km;
$("#maxKm").textContent = maxKm;
function setOwn(on) {
  $("#stage").dataset.own = String(on);
  $("#ownBtn").setAttribute("aria-pressed", String(on));
  on ? map.dragPan.disable() : map.dragPan.enable();
  if (!on) { own.box = null; map.getSource("own")?.setData({ type: "FeatureCollection", features: [] }); }
  ownStep(1, "Click and drag on the map.");
  $("#ownRun").disabled = true;
}
function ownStep(n, msg, warn = false) {
  $$("#ownSteps li").forEach((li, i) => (li.dataset.state = i + 1 < n ? "done" : i + 1 === n ? "active" : ""));
  $("#ownMsg").innerHTML = msg;
  $("#ownMsg").classList.toggle("warn", warn);
}
const kmBetween = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const dx = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad) * R, dy = (b.lat - a.lat) * rad * R;
  return [Math.abs(dx), Math.abs(dy)];
};
$("#ownBtn").addEventListener("click", () => setOwn($("#stage").dataset.own !== "true"));
$("#ownBtn2").addEventListener("click", () => { setPop(cityBtn, cityPop, false); setOwn(true); });
$("#ownCancel").addEventListener("click", () => setOwn(false));
$("#ownRun").addEventListener("click", async () => {
  ownStep(3, `<span class="spinner"></span>Waking up the server… free hosts sleep when nobody uses them.`);
  $("#ownRun").disabled = true;
  await new Promise((r) => setTimeout(r, 1800));
  const t = api.predict.ahmedabad_10km_2026;
  ownStep(3, `Not connected in this prototype. The live service is built and tested on the laptop: a ${maxKm} km box took ${t.seconds} s${src("results/api_check.json", "predict.ahmedabad_10km_2026.seconds", "Local Docker test of the API (step 5.2b).")}. It goes online in step 6.2.`, true);
});

// ---------- Keyboard ----------
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const i = years.indexOf(state.year) + (e.key === "ArrowRight" ? 1 : -1);
    if (years[i] && !state.compare) setYear(years[i]);
  } else if (/^[1-4]$/.test(e.key)) { const c = d.index.cities[Number(e.key) - 1]; if (c) switchCity(c.id); }
  else if (e.key.toLowerCase() === "c") setCompare(!state.compare);
  else if (e.key.toLowerCase() === "h") togglePanels();
  else if (e.key === "Escape") { if ($("#stage").dataset.own === "true") setOwn(false); else select(null); }
});

// ---------- Render everything that depends on state ----------
function renderAll() {
  const s = state.city.summary;
  $("#cityName").textContent = s.name;
  $("#cityTile").textContent = `tile ${s.tile}`;
  $("#citySw").style.backgroundImage = `url(${state.city.base}${s.files.overlay[years[1]]})`;
  $$("#years button").forEach((b) => { b.setAttribute("aria-pressed", String(!state.compare && b.dataset.y === state.year)); b.disabled = state.compare; });
  $("#changedCount").textContent = s.changed_patches.toLocaleString("en-US");
  const hasChecks = state.city.id === "ahmedabad";
  $("#checksRow").setAttribute("aria-disabled", String(!hasChecks));
  $("#checksNote").textContent = hasChecks ? "50 squares, Ahmedabad only" : "Only Ahmedabad was checked";
  $("#modelTag").textContent = "EfficientNet-B0 · 10 m Sentinel-2";
  renderLegend(); renderInspector(); renderDownloads(); writeUrl();
  applyLayers(map); applyLayers(mapB);
  document.title = `${s.name} · Explorer · TerraScan`;
}

// ---------- Map events ----------
map.on("load", () => {
  map.addSource("own", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "own-fill", type: "fill", source: "own", paint: { "fill-color": "#ffb224", "fill-opacity": 0.12 } });
  map.addLayer({ id: "own-line", type: "line", source: "own", paint: { "line-color": "#ffb224", "line-width": 2, "line-dasharray": [2, 1.5] } });
  map.setChecks(checkFeatures());
  if (phone()) $("#layersPanel").dataset.hidden = "true";
  renderAll();
  if (state.sel !== null) map.highlight("selected", state.sel);
  map.jumpTo(fitCam());
  if (state.compare) setCompare(true);
});
// Hover label: its text and the map outline change only when the pointer moves to another square, and it is
// moved with a transform once per frame (D rewrote it on every mouse event).
const tip = $("#tip");
let tipId = null, tipPt = null, tipRaf = 0;
map.on("mousemove", "hit", (e) => {
  if ($("#stage").dataset.own === "true") return;
  const f = e.features[0], y = state.compare ? years[1] : state.year;
  tipPt = e.point;
  if (f.id !== tipId) {
    tipId = f.id;
    map.highlight("hover", f.id);
    map.getCanvas().style.cursor = "pointer";
    tip.innerHTML = `<i style="background:${colour[f.properties[`class_${y}`]]}"></i>${LABEL[f.properties[`class_${y}`]]}<span>${pct(f.properties[`confidence_${y}`], 0)}%</span>`;
    tip.hidden = false;
  }
  tipRaf ||= requestAnimationFrame(() => { tipRaf = 0; tip.style.transform = `translate(${tipPt.x + 14}px, ${tipPt.y}px) translateY(-50%)`; });
});
map.on("mouseleave", "hit", () => { tipId = null; map.highlight("hover", null); tip.hidden = true; map.getCanvas().style.cursor = ""; });
map.on("click", "hit", (e) => { if ($("#stage").dataset.own !== "true") select(e.features[0].id); });
let cur = null, curRaf = 0;
map.on("mousemove", (e) => {
  cur = e.lngLat;
  curRaf ||= requestAnimationFrame(() => { curRaf = 0; $("#cursor").textContent = `${cur.lat.toFixed(4)}° N  ${cur.lng.toFixed(4)}° E`; });
});
map.on("zoom", () => ($("#zoomVal").textContent = map.getZoom().toFixed(1)));
$("#zIn").addEventListener("click", () => map.zoomIn());
$("#zOut").addEventListener("click", () => map.zoomOut());
$("#zFit").addEventListener("click", () => map.flyTo({ ...fitCam(), duration: reducedMotion() ? 0 : 1200, essential: true }));

// Drawing the box for "map your own area"
map.on("mousedown", (e) => { if ($("#stage").dataset.own === "true") own.start = e.lngLat; });
map.on("mousemove", (e) => {
  if (!own.start || $("#stage").dataset.own !== "true") return;
  const a = own.start, b = e.lngLat;
  own.box = [[a.lng, a.lat], [b.lng, a.lat], [b.lng, b.lat], [a.lng, b.lat], [a.lng, a.lat]];
  map.getSource("own").setData({ type: "Feature", geometry: { type: "Polygon", coordinates: [own.box] } });
  const [w, h] = kmBetween(a, b);
  const ok = w <= maxKm && h <= maxKm && w > 0.64 && h > 0.64;
  ownStep(ok ? 2 : 1, `${w.toFixed(1)} × ${h.toFixed(1)} km${ok ? ` · year ${state.year} (from the toolbar)` : w <= 0.64 || h <= 0.64 ? " · too small, at least one 640 m square" : ` · too big, keep each side under ${maxKm} km`}`, !ok);
  $("#ownRun").disabled = !ok;
});
map.on("mouseup", () => (own.start = null));
