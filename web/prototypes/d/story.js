// Story page (prototype D). Every number is read from the data files and carries a source marker (ⓘ).
import { loadAll, LABEL, km2, pct } from "../shared/data.js";
import { initShell, onThemeChange, reducedMotion, src, ICON } from "./shell.js";
import { createMap, cityBounds, cityCenter, maplibregl } from "./geo.js";

initShell({ page: "story" });
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const phone = () => innerWidth <= 960;
const set = (sel, v) => $$(sel).forEach((el) => (el.textContent = v));
const putSrc = (sel, ...args) => $$(sel).forEach((el) => (el.outerHTML = src(...args)));

async function csv(url) {
  const [head, ...rows] = (await (await fetch(url)).text()).trim().split("\n");
  const keys = head.split(",");
  return rows.map((r) => Object.fromEntries(r.split(",").map((v, i) => [keys[i], v])));
}

const [d, sample, reviewed, india] = await Promise.all([
  loadAll(),
  csv("../../../results/change_check_sample.csv"),
  csv("../../../results/change_check_reviewed.csv"),
  fetch("../../../results/india_dataset.json").then((r) => r.json()),
]);
const [y0, y1] = d.index.years;
const city = d.city, s = city.summary, c = d.check;
const CC = "results/change_check.json";
const SUM = "web/public/data/ahmedabad/summary.json";

// ---------- Numbers ----------
set("[data-y0]", y0); set("[data-y1]", y1);
set("[data-scenes0]", s.years[y0].n_scenes); set("[data-scenes1]", s.years[y1].n_scenes);
putSrc("[data-src-scenes0]", SUM, `years.${y0}.n_scenes`, "Clear Sentinel-2 scenes in the Dec–Feb window, merged per pixel (median).");
putSrc("[data-src-scenes1]", SUM, `years.${y1}.n_scenes`, "Clear Sentinel-2 scenes in the Dec–Feb window, merged per pixel (median).");
set("[data-changed]", s.changed_patches.toLocaleString("en-US"));
set("[data-total]", s.n_patches.toLocaleString("en-US"));
putSrc("[data-src-changed]", SUM, "changed_patches / n_patches", "Model: fine-tuned EfficientNet-B0, seed 42 (ONNX).");
set("[data-n]", c.n_pairs);
set("[data-rate]", pct(c.final.real_rate, 0));
putSrc("[data-src-rate]", CC, "final.real_rate", "Share of checked squares judged a real change.");
set("[data-reported]", km2(c.reported_changed_km2));
putSrc("[data-src-reported]", CC, "reported_changed_km2");
set("[data-real]", km2(c.estimated_real_changed_km2));
putSrc("[data-src-real]", CC, "estimated_real_changed_km2", "Reported area × share that held up.");
set("[data-lo]", km2(c.estimated_real_changed_km2_95[0])); set("[data-hi]", km2(c.estimated_real_changed_km2_95[1]));
set("[data-ntrain]", india.per_split.train);
putSrc("[data-src-ntrain]", "results/india_dataset.json", "per_split.train", "Indian squares used for fine-tuning; the test areas were kept apart.");
const scale = c.estimated_real_changed_km2 / c.reported_changed_km2;
$("#realBar").style.setProperty("--to", scale);
$("#realCi").style.setProperty("--lo", `${(c.estimated_real_changed_km2_95[0] / c.reported_changed_km2) * 100}%`);
$("#realCi").style.setProperty("--w", `${((c.estimated_real_changed_km2_95[1] - c.estimated_real_changed_km2_95[0]) / c.reported_changed_km2) * 100}%`);

// ---------- Contact sheet: the most confident real square for six classes ----------
const colour = Object.fromEntries(d.index.classes.map((k) => [k.name, k.colour]));
const cols = s.grid_cols, rows = s.grid_rows;
const best = {};
city.patches.forEach((p, i) => {
  const k = p[`class_${y1}`], conf = Number(p[`confidence_${y1}`]);
  if (!best[k] || conf > best[k].conf) best[k] = { conf, row: Math.floor(i / cols), col: i % cols };
});
const pick = ["Residential", "Industrial", "AnnualCrop", "Highway", "PermanentCrop", "River"].filter((k) => best[k]);
const rgb = city.base + s.files.rgb[y1];
$("#sheet").innerHTML = pick.map((k) => {
  const b = best[k];
  return `<div class="tile"><div class="px" style="--c:${colour[k]};background-image:url(${rgb});background-size:${cols * 100}% ${rows * 100}%;background-position:${(b.col / (cols - 1)) * 100}% ${(b.row / (rows - 1)) * 100}%"></div>
    <span>${LABEL[k]}<small>${pct(b.conf, 0)}% sure</small></span></div>`;
}).join("");

// ---------- What changed ----------
const top3 = s.changes.slice(0, 3);
if (top3.every((t) => t.from === top3[0].from)) set("[data-top-note]", `Its three biggest shifts all start as ${LABEL[top3[0].from].toLowerCase()}:`);
$("#changeChips").innerHTML = top3.map((t) =>
  `<span class="chip"><i style="--c:${colour[t.to]}"></i>${LABEL[t.from]} → ${LABEL[t.to]} · ${km2(t.km2)} km²</span>`).join("") +
  src(SUM, "changes[0..2]", "Reported by the model; not each one checked.");

// ---------- The 50 checks ----------
const verdict = Object.fromEntries(reviewed.map((r) => [r.pair, r.final]));
const order = { yes: 0, unclear: 1, no: 2 };
$("#waffle").innerHTML = [...reviewed].sort((a, b) => order[a.final] - order[b.final])
  .map((r, i) => `<i class="${r.final}" style="--i:${i}" title="${r.pair}: ${r.final}"></i>`).join("");
const checks = sample.map((p) => ({ type: "Feature", properties: { verdict: verdict[p.pair] }, geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] } }));

// ---------- Europe -> India ----------
const r = d.india;
$("#dots").innerHTML = [
  ["Europe test", r.eurosat_test_accuracy_before, "", "summary_mean_std_over_seeds.eurosat_test_accuracy_before"],
  ["India, before", r.india_test_accuracy_before, "", "summary_mean_std_over_seeds.india_test_accuracy_before"],
  ["India, after", r.india_test_accuracy_after, "hl", "summary_mean_std_over_seeds.india_test_accuracy_after"],
].map(([n, v, cls, key]) => {
  const lo = (v.mean - v.std) * 100, hi = (v.mean + v.std) * 100;
  return `<div class="dot-row ${cls}"><span class="n">${n}</span><span class="axis"><i class="w" style="left:${lo}%;width:${hi - lo}%"></i><i class="p" style="left:${v.mean * 100}%"></i></span>
    <span class="val">${pct(v.mean)}%${src("results/india_after.json", key, "EfficientNet-B0, seeds 42/43/44, mean ± std.")}</span></div>`;
}).join("");

// ---------- City cards ----------
Promise.all(d.index.cities.map((k) => fetch(`../../public/data/${k.summary}`).then((x) => x.json()))).then((sums) => {
  $("#cityCards").innerHTML = sums.map((cs) => {
    const t = cs.changes[0];
    return `<a class="ccard reveal" href="explorer.html?city=${cs.id}">
      <span class="mosaic"><img src="../../public/data/${cs.id}/${cs.files.rgb[y1]}" alt="" loading="lazy"><img class="ov" src="../../public/data/${cs.id}/${cs.files.overlay[y1]}" alt="" loading="lazy"></span>
      <span class="body"><b>${cs.name}</b><span class="stat">${km2(cs.changed_km2)} km² reported changed · ${cs.n_patches.toLocaleString("en-US")} squares</span>
      <span class="flip"><span>Biggest shift</span><span>${LABEL[t.from]} → ${LABEL[t.to]}</span></span>
      <span class="go">Open in Explorer ${ICON.arrow}</span></span></a>`;
  }).join("");
  if (!reducedMotion()) {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0.2 });
    $$(".ccard").forEach((el, i) => { el.style.transitionDelay = `${i * 70}ms`; io.observe(el); });
  }
});

// ---------- Map and chapters ----------
const map = createMap($("#map"), {
  city, classes: d.index.classes, years: d.index.years, year: y1, interactive: false,
  center: [62, 16], zoom: phone() ? 0.35 : 1.75, landuseOpacity: 0.6,
});
onThemeChange(() => map.applyTheme());
const heroPad = () => (phone() ? { top: 40, bottom: Math.round(innerHeight * 0.62), left: 0, right: 0 } : { left: innerWidth * 0.42, right: 0, top: 0, bottom: 0 });
map.setPadding(heroPad());

const pad = () => (phone() ? { top: 70, bottom: Math.round(innerHeight * 0.5), left: 12, right: 12 } : { top: 90, bottom: 60, left: Math.min(560, innerWidth * 0.4), right: 80 });
function cityCam(extra = {}) {
  const p = pad();
  // absolutePadding: this padding replaces the hero's, instead of adding to it. Pitch/bearing are included so a
  // tilted city still fits.
  const cam = map.cameraForBounds(cityBounds(city), { padding: p, absolutePadding: true, pitch: extra.pitch ?? 0, bearing: extra.bearing ?? 0 });
  return { center: cam?.center ?? cityCenter(city), zoom: (cam?.zoom ?? 10) - 0.08, padding: p, ...extra };
}

let pins = [];
function setPins(on) {
  pins.forEach((m) => m.remove());
  pins = [];
  if (!on) return;
  top3.slice(0, 2).forEach((t) => {
    const p = city.patches.map((q, i) => ({ q, i })).filter(({ q }) => q.changed === "True" && q.class_2018 === t.from && q[`class_${y1}`] === t.to)
      .sort((a, b) => Number(b.q[`confidence_${y1}`]) - Number(a.q[`confidence_${y1}`]))[0];
    if (!p) return;
    const el = document.createElement("div");
    el.className = "note-pin";
    el.innerHTML = `<i></i><span>${LABEL[t.from]} → ${LABEL[t.to]}</span>`;
    pins.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([Number(p.q.lon), Number(p.q.lat)]).addTo(map));
  });
}

const CHAPTERS = [
  { label: "Start", cam: () => ({ center: [62, 16], zoom: phone() ? 0.35 : 1.75, pitch: 0, bearing: 0, padding: heroPad() }), landuse: false },
  { label: "The city", cam: () => cityCam({ pitch: 48, bearing: -16 }), year: y1, landuse: false },
  { label: "What the model sees", cam: () => cityCam({ pitch: 30, bearing: -8 }), year: y1, landuse: true },
  { label: "What changed", cam: () => cityCam({ pitch: 40, bearing: 12 }), year: y1, landuse: false, changes: true, pins: true },
  { label: "How sure", cam: () => cityCam({ pitch: 0, bearing: 0 }), year: y1, landuse: false, changes: true, checks: true },
  { label: "Europe → India", cam: () => ({ center: [44, 34], zoom: phone() ? 1.0 : 2.0, pitch: 0, bearing: 0, padding: phone() ? { top: 0, bottom: innerHeight * 0.45, left: 0, right: 0 } : { left: Math.min(560, innerWidth * 0.4), right: 0, top: 0, bottom: 0 } }), landuse: false },
  { label: "Limits", cam: () => cityCam({ pitch: 20, bearing: 0 }), year: y1, landuse: true, confidence: true },
];

let current = -1;
function go(i) {
  if (i === current || !map.loaded()) return;
  const prev = current;
  current = i;
  const ch = CHAPTERS[i];
  if (ch.year) map.showYear(ch.year);
  map.setLanduse({ on: !!ch.landuse, confidence: !!ch.confidence });
  map.setVisible("changes", !!ch.changes);
  map.setVisible("checks", !!ch.checks);
  setPins(!!ch.pins);
  const cam = ch.cam();
  if (reducedMotion()) map.jumpTo(cam);
  else {
    // Long flights (globe <-> city) get more time than moves within the city.
    const far = [prev, i].includes(0) || [prev, i].includes(5) || prev === -1;
    map.flyTo({ ...cam, duration: far ? 4200 : 2200, curve: 1.35, essential: true });
  }
  $$(".rail a").forEach((a, k) => (k + 1 === i ? a.setAttribute("aria-current", "step") : a.removeAttribute("aria-current")));
  $("#rail").dataset.show = String(i > 0);
  spin(i === 0);
}

// Gentle globe spin while the hero is on screen (off with reduced motion).
let spinning = false;
function spin(on) {
  if (reducedMotion() || on === spinning) return;
  spinning = on;
  const step = () => {
    if (!spinning || current !== 0) return (spinning = false);
    const ctr = map.getCenter();
    map.setCenter([ctr.lng + 0.035, ctr.lat]);
    requestAnimationFrame(step);
  };
  if (on) requestAnimationFrame(step);
}

$("#rail").innerHTML = CHAPTERS.slice(1).map((ch, k) => `<a href="#c${k + 1}"><span>${ch.label}</span><i></i></a>`).join("");

map.on("load", () => {
  map.setChecks(checks);
  current = -1;
  go(0);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      e.target.classList.toggle("on", e.isIntersecting);
      if (e.isIntersecting) go(Number(e.target.dataset.step));
    }
  }, { rootMargin: "-45% 0px -45% 0px" });
  $$(".step").forEach((el) => io.observe(el));
});

addEventListener("scroll", () => {
  const story = $(".story");
  const p = Math.min(1, Math.max(0, scrollY / (story.offsetHeight - innerHeight)));
  $("#progress").style.setProperty("--p", p);
  $("#cue").style.opacity = scrollY > 40 ? 0 : 1;
}, { passive: true });
