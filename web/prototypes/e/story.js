// Story page (prototype E). Every number is read from the data files and carries a source marker (ⓘ).
// New in E: count-ups, word-by-word headline, hover links between the cards and the map, the "You vs the model"
// game, and city cards that dissolve from one year to the other square by square.
import { loadAll, LABEL, km2, pct } from "../shared/data.js";
import { initShell, onThemeChange, reducedMotion, src, ICON } from "./shell.js";
import { createMap, cityBounds, cityCenter, maplibregl } from "./geo.js";
import { countTo, onceVisible, splitWords, spotlight, pixelSwap, loadImage } from "./motion.js";
import { initGame } from "./game.js";

initShell({ page: "story" });
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const phone = () => innerWidth <= 960;
const set = (sel, v) => $$(sel).forEach((el) => (el.textContent = v));
const putSrc = (sel, ...args) => $$(sel).forEach((el) => (el.outerHTML = src(...args)));
const int = (v) => Math.round(v).toLocaleString("en-US");

// The headline comes in word by word (before the data loads, so it is the first thing that moves).
splitWords($("#heroTitle"));

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
set("[data-changed]", int(s.changed_patches));
set("[data-total]", int(s.n_patches));
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

// Hero stats: count up once the page is ready.
putSrc("[data-src-hs-squares]", SUM, "n_patches", "Ahmedabad, one 640 m square each.");
putSrc("[data-src-hs-km]", CC, "reported_changed_km2", `Squares whose class differs between ${y0} and ${y1}.`);
putSrc("[data-src-hs-real]", CC, "final.real_rate", `${c.n_pairs} random flagged squares, compared by eye.`);
countTo($("[data-hs-squares]"), s.n_patches, { delay: 500, ms: 1400 });
countTo($("[data-hs-km]"), c.reported_changed_km2, { delay: 650, ms: 1400 });
countTo($("[data-hs-real]"), c.final.real_rate * 100, { delay: 800, ms: 1400 });

// ---------- Contact sheet: the most confident real square for six classes ----------
const colour = Object.fromEntries(d.index.classes.map((k) => [k.name, k.colour]));
const cols = s.grid_cols, rows = s.grid_rows;
const best = {};
city.patches.forEach((p, i) => {
  const k = p[`class_${y1}`], conf = Number(p[`confidence_${y1}`]);
  if (!best[k] || conf > best[k].conf) best[k] = { conf, id: i, row: Math.floor(i / cols), col: i % cols };
});
const pick = ["Residential", "Industrial", "AnnualCrop", "Highway", "PermanentCrop", "River"].filter((k) => best[k]);
const rgb = city.base + s.files.rgb[y1];
$("#sheet").innerHTML = pick.map((k, n) => {
  const b = best[k];
  return `<div class="tile" data-id="${b.id}" style="--n:${n}"><div class="px" style="--c:${colour[k]};background-image:url(${rgb});background-size:${cols * 100}% ${rows * 100}%;background-position:${(b.col / (cols - 1)) * 100}% ${(b.row / (rows - 1)) * 100}%"><span class="scan"></span></div>
    <span>${LABEL[k]}<small>${pct(b.conf, 0)}% sure</small></span><i class="conf" style="--w:${b.conf}"></i></div>`;
}).join("");

// ---------- What changed: the three biggest shifts as bars ----------
const top3 = s.changes.slice(0, 3);
if (top3.every((t) => t.from === top3[0].from)) set("[data-top-note]", `Its three biggest shifts all start as ${LABEL[top3[0].from].toLowerCase()}:`);
const maxKm = Math.max(...top3.map((t) => t.km2));
$("#shifts").innerHTML = top3.map((t, n) =>
  `<button type="button" class="shift" data-from="${t.from}" data-to="${t.to}" style="--n:${n};--w:${t.km2 / maxKm};--c0:${colour[t.from]};--c1:${colour[t.to]}">
    <span class="sw"><i></i><i></i></span><span class="t">${LABEL[t.from]} → ${LABEL[t.to]}</span>
    <span class="v"><span data-km="${t.km2}">${km2(t.km2)}</span> km²</span><span class="bar"><i></i></span></button>`).join("");
$("[data-top-note]").insertAdjacentHTML("afterend", src(SUM, "changes[0..2]", "Reported by the model; not each one checked."));

// ---------- The 50 checks ----------
const verdict = Object.fromEntries(reviewed.map((r) => [r.pair, r.final]));
const sampleIndex = Object.fromEntries(sample.map((p, i) => [p.pair, i]));
const order = { yes: 0, unclear: 1, no: 2 };
$("#waffle").innerHTML = [...reviewed].sort((a, b) => order[a.final] - order[b.final])
  .map((r, i) => `<i class="${r.final}" style="--i:${i}" data-id="${sampleIndex[r.pair]}" title="${r.pair}: ${r.final}"></i>`).join("");
const checks = sample.map((p, i) => ({ type: "Feature", id: i, properties: { verdict: verdict[p.pair] }, geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] } }));

// ---------- Europe -> India ----------
const r = d.india;
$("#dots").innerHTML = [
  ["Europe test", r.eurosat_test_accuracy_before, "", "summary_mean_std_over_seeds.eurosat_test_accuracy_before"],
  ["India, before", r.india_test_accuracy_before, "", "summary_mean_std_over_seeds.india_test_accuracy_before"],
  ["India, after", r.india_test_accuracy_after, "hl", "summary_mean_std_over_seeds.india_test_accuracy_after"],
].map(([n, v, cls, key], k) => {
  const lo = (v.mean - v.std) * 100, hi = (v.mean + v.std) * 100;
  return `<div class="dot-row ${cls}" style="--n:${k}"><span class="n">${n}</span><span class="axis"><i class="w" style="left:${lo}%;width:${hi - lo}%"></i><i class="p" style="--x:${v.mean}"></i></span>
    <span class="val"><span data-acc="${v.mean * 100}">${pct(v.mean)}</span>%${src("results/india_after.json", key, "EfficientNet-B0, seeds 42/43/44, mean ± std.")}</span></div>`;
}).join("");

// ---------- City cards: 2018 -> 2026, square by square ----------
Promise.all(d.index.cities.map((k) => fetch(`../../public/data/${k.summary}`).then((x) => x.json()))).then((sums) => {
  $("#cityCards").innerHTML = sums.map((cs, n) => {
    const t = cs.changes[0];
    return `<a class="ccard reveal" href="explorer.html?city=${cs.id}" style="--n:${n}">
      <span class="mosaic"><canvas data-city="${cs.id}" aria-hidden="true"></canvas><span class="yr"><b>${y0}</b><b>${y1}</b></span></span>
      <span class="body"><b>${cs.name}</b><span class="stat"><span data-ckm="${cs.changed_km2}">0</span> km² reported changed · ${int(cs.n_patches)} squares</span>
      <span class="flip"><span>Biggest shift</span><span>${LABEL[t.from]} → ${LABEL[t.to]}</span></span>
      <span class="go">Open in Explorer ${ICON.arrow}</span></span></a>`;
  }).join("");
  sums.forEach((cs, n) => {
    const card = $$(".ccard")[n];
    spotlight(card, { tilt: 5 });
    onceVisible(card, () => {
      card.classList.add("in");
      countTo(card.querySelector("[data-ckm]"), cs.changed_km2, { delay: 150 + n * 80 });
    }, 0.2);
    // Small pictures (thumb_<year>.webp, made by scripts/web_thumbs.py), loaded only when the cards come near.
    onceVisible(card, async () => {
      const base = `../../public/data/${cs.id}/`;
      const [a, b, oa, ob] = await Promise.all([
        loadImage(`${base}thumb_${y0}.webp`),
        loadImage(`${base}thumb_${y1}.webp`),
        loadImage(base + cs.files.overlay[y0]),
        loadImage(base + cs.files.overlay[y1]),
      ]);
      // Each year's picture with its land-use colours on top, drawn once into a canvas.
      const tint = (img, ov) => {
        const cv = document.createElement("canvas");
        cv.width = img.width; cv.height = img.height;
        const x = cv.getContext("2d", { willReadFrequently: true }); // CPU canvas, see motion.js pixelSwap
        x.drawImage(img, 0, 0);
        x.globalAlpha = 0.34; x.imageSmoothingEnabled = false;
        x.drawImage(ov, 0, 0, cv.width, cv.height);
        return cv;
      };
      const canvas = card.querySelector("canvas");
      const swap = pixelSwap(canvas, tint(a, oa), tint(b, ob), cs.grid_cols, cs.grid_rows, { ms: 900, seed: n + 7 });
      canvas.classList.add("ready");
      const go = (v) => { swap.to(v); card.dataset.year = v ? "1" : "0"; };
      card.addEventListener("pointerenter", () => go(1));
      card.addEventListener("pointerleave", () => go(0));
      card.addEventListener("focus", () => go(1));
      card.addEventListener("blur", () => go(0));
      // Touch screens have no hover: play the change once when the card is fully on screen.
      if (!matchMedia("(hover: hover)").matches) onceVisible(card, () => setTimeout(() => go(1), 400), 0.9);
    }, 0);
  });
});

// ---------- The game ----------
initGame({ classes: d.index.classes, colour });

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

// The two pins are made once and only shown or hidden.
const pins = top3.slice(0, 2).map((t) => {
  const p = city.patches.map((q, i) => ({ q, i })).filter(({ q }) => q.changed === "True" && q[`class_${y0}`] === t.from && q[`class_${y1}`] === t.to)
    .sort((a, b) => Number(b.q[`confidence_${y1}`]) - Number(a.q[`confidence_${y1}`]))[0];
  if (!p) return null;
  const el = document.createElement("div");
  el.className = "note-pin";
  el.innerHTML = `<i></i><span>${LABEL[t.from]} → ${LABEL[t.to]}</span>`;
  return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([Number(p.q.lon), Number(p.q.lat)]);
}).filter(Boolean);
let pinsOn = false;
function setPins(on) {
  if (on === pinsOn) return;
  pinsOn = on;
  pins.forEach((m) => (on ? m.addTo(map) : m.remove()));
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
  // No map.loaded() check here: chapters only start after the map's load event, and map.loaded() is false
  // whenever a layer is still being prepared, which silently dropped chapter switches (seen in step 5.3a).
  if (i === current) return;
  const prev = current;
  current = i;
  const ch = CHAPTERS[i];
  if (ch.year) map.showYear(ch.year);
  map.setLanduse({ on: !!ch.landuse, confidence: !!ch.confidence });
  map.setVisible("changes", !!ch.changes);
  map.setVisible("checks", !!ch.checks);
  map.focusChange(null);
  map.highlight("selected", null);
  map.highlight("checks-hl", null);
  setPins(!!ch.pins);
  const cam = ch.cam();
  if (reducedMotion()) map.jumpTo(cam);
  else {
    // Long flights (globe <-> city) get more time than moves within the city.
    const far = [prev, i].includes(0) || [prev, i].includes(5) || prev === -1;
    map.flyTo({ ...cam, duration: far ? 3600 : 2000, curve: 1.35, essential: true });
  }
  $$(".rail a").forEach((a, k) => (k + 1 === i ? a.setAttribute("aria-current", "step") : a.removeAttribute("aria-current")));
  $("#rail").dataset.show = String(i > 0);
  spin(i === 0);
}

// Gentle globe spin while the hero is on screen (off with reduced motion). Pauses when the tab is hidden.
let spinning = false;
function spin(on) {
  if (reducedMotion() || on === spinning) return;
  spinning = on;
  const step = () => {
    if (!spinning || current !== 0) return (spinning = false);
    if (!document.hidden) { const ctr = map.getCenter(); map.setCenter([ctr.lng + 0.035, ctr.lat]); }
    requestAnimationFrame(step);
  };
  if (on) requestAnimationFrame(step);
}

$("#rail").innerHTML = CHAPTERS.slice(1).map((ch, k) => `<a href="#c${k + 1}"><span>${ch.label}</span><i></i></a>`).join("");

// What happens the first time each chapter card is on screen (count-ups); bars and waffle replay via CSS (.on).
const firstSeen = {
  1: () => { countTo($("#c1 [data-scenes0]"), s.years[y0].n_scenes, { ms: 900 }); countTo($("#c1 [data-scenes1]"), s.years[y1].n_scenes, { ms: 900, delay: 120 }); },
  3: () => { countTo($("#c3 [data-changed]"), s.changed_patches, { ms: 1000 }); $$("#shifts [data-km]").forEach((el, n) => countTo(el, Number(el.dataset.km), { delay: 250 + n * 90 })); },
  5: () => $$("#dots [data-acc]").forEach((el, n) => countTo(el, Number(el.dataset.acc), { delay: 200 + n * 120, format: (v) => v.toFixed(1) })),
};
// Every time chapter 4 comes on: the real-change number counts DOWN from the reported one while its bar shrinks.
const onEnter = {
  4: () => countTo($("#c4 [data-real]"), c.estimated_real_changed_km2, { from: c.reported_changed_km2, ms: 900, delay: 300 }),
};

map.on("load", () => {
  map.setChecks(checks);
  current = -1;
  go(0);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      e.target.classList.toggle("on", e.isIntersecting);
      if (!e.isIntersecting) continue;
      const k = Number(e.target.dataset.step);
      if (!e.target.classList.contains("seen")) { e.target.classList.add("seen"); firstSeen[k]?.(); }
      onEnter[k]?.();
      go(k);
    }
  }, { rootMargin: "-45% 0px -45% 0px" });
  $$(".step").forEach((el) => io.observe(el));
  // The chapter rail belongs to the story only: hide it once the story has scrolled away.
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) $("#rail").dataset.show = "false"; else if (current > 0) $("#rail").dataset.show = "true"; },
    { rootMargin: "0px 0px -60% 0px" }).observe($(".steps"));
});

// ---------- Hover links: cards point at things on the map ----------
// Pointer events are ignored for a moment after each scroll: when the page scrolls under a still mouse, the
// browser sends "pointer moved" events, and each one would redraw the map for nothing (seen in step 5.3a traces).
let lastScroll = 0;
addEventListener("scroll", () => (lastScroll = performance.now()), { passive: true });
const scrolling = () => performance.now() - lastScroll < 150;
const hoverOrFocus = (root, selector, on, off) => {
  let cur = null;
  const enter = (t) => { if (t === cur) return; if (cur) off(cur); cur = t; on(t); };
  const leave = () => { if (cur) { off(cur); cur = null; } };
  root.addEventListener("pointermove", (e) => { if (scrolling()) return; const t = e.target.closest(selector); t ? enter(t) : leave(); });
  root.addEventListener("pointerleave", leave);
  root.addEventListener("focusin", (e) => { const t = e.target.closest(selector); if (t) enter(t); });
  root.addEventListener("focusout", leave);
};
hoverOrFocus($("#sheet"), ".tile", (t) => map.highlight("selected", Number(t.dataset.id)), () => map.highlight("selected", null));
hoverOrFocus($("#shifts"), ".shift", (t) => { map.focusChange(t.dataset.from, t.dataset.to); $("#shifts").dataset.focus = "1"; t.dataset.on = "1"; },
  (t) => { map.focusChange(null); delete $("#shifts").dataset.focus; delete t.dataset.on; });
hoverOrFocus($("#waffle"), "i", (t) => map.highlight("checks-hl", Number(t.dataset.id)), () => map.highlight("checks-hl", null));

// ---------- Scroll: progress bar and cue (one listener, work done in a frame) ----------
let storyH = $(".story").offsetHeight;
addEventListener("resize", () => (storyH = $(".story").offsetHeight), { passive: true });
let ticking = false;
addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    $("#progress").style.setProperty("--p", Math.min(1, Math.max(0, scrollY / (storyH - innerHeight))));
    $("#cue").style.opacity = scrollY > 40 ? 0 : 1;
  });
}, { passive: true });
