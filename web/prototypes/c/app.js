// Landing page for direction C: globe -> fly to Ahmedabad -> 2018 fades to 2026 -> caption; then scroll reveals.
import { loadAll, km2, pct } from "../shared/data.js";
import { createMap, cityBounds, reducedMotion } from "./map.js";
import { initTheme } from "./theme.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = () => innerWidth <= 900;

const d = await loadAll();
const [y0, y1] = d.index.years;
const c = d.check;

// Fill numbers from the data files.
$$("[data-y0]").forEach((el) => (el.textContent = y0));
$$("[data-y1]").forEach((el) => (el.textContent = y1));
$$("[data-reported]").forEach((el) => (el.textContent = km2(c.reported_changed_km2)));
$$("[data-real]").forEach((el) => (el.textContent = km2(c.estimated_real_changed_km2)));
$$("[data-n]").forEach((el) => (el.textContent = c.n_pairs));
$$("[data-rate]").forEach((el) => (el.textContent = pct(c.final.real_rate, 0)));
$("[data-lo]").textContent = km2(c.estimated_real_changed_km2_95[0]);
$("[data-hi]").textContent = km2(c.estimated_real_changed_km2_95[1]);
$("#realBar").style.setProperty("--to", c.estimated_real_changed_km2 / c.reported_changed_km2);

const s = d.india;
$("#cols").innerHTML = [
  [s.eurosat_test_accuracy_before, ""],
  [s.india_test_accuracy_before, ""],
  [s.india_test_accuracy_after, "hl"],
]
  .map(([v, cls]) => `<div class="col ${cls}"><div class="v" data-count="${v.mean * 100}" data-digits="1">${pct(v.mean)}<small>%</small></div>
    <div class="bar" style="--h:${v.mean * 100}%"><i class="err" style="--lo:${((v.mean - v.std) / v.mean) * 100}%;--span:${((2 * v.std) / v.mean) * 100}%"></i></div></div>`)
  .join("");

// With motion on, animated numbers start where their animation starts (no jump when they begin).
if (!reducedMotion()) {
  $("#realCount").textContent = km2(c.reported_changed_km2);
  $$("#cols [data-count]").forEach((el) => (el.innerHTML = `0.0${el.querySelector("small").outerHTML}`));
}

// Headline appears at once (it is the largest text, so it must paint early).
requestAnimationFrame(() => $$(".rise").forEach((el, i) => setTimeout(() => el.classList.add("in"), i * 80)));

// ----- The map: globe, fly-in, year cross-fade -----
const OVERLAY = 0.5;
let year = y0;
const map = createMap($("#map"), d.city, d.index.years, {
  interactive: false, center: [25, 18], zoom: phone() ? 0.6 : 1.4, shownYear: y0, overlayOpacity: 0,
});
initTheme($("#theme"), () => map.applyTheme());

const years = $("#years");
years.innerHTML = d.index.years.map((y) => `<button type="button" data-y="${y}">${y}</button>`).join("");
function setYear(y) {
  year = y;
  map.showYear(y, OVERLAY);
  $$("#years button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.y === y)));
  $("#figYear").textContent = y;
}
years.addEventListener("click", (e) => e.target.dataset.y && setYear(e.target.dataset.y));
$("#figYear").textContent = year;

// Desktop: the map keeps a left padding as wide as the text column, so the globe and the city sit beside the
// headline instead of under it. Phone: the map is above the text, so no padding.
const sidePad = () => (phone() ? 0 : Math.min(640, innerWidth * 0.42));
map.setPadding({ left: sidePad(), right: 0, top: 0, bottom: 0 });

function landing() {
  const padding = phone() ? { top: 64, bottom: 8, left: 12, right: 12 } : { top: 100, bottom: 140, left: 40, right: 64 };
  const cam = map.cameraForBounds(cityBounds(d.city), { padding });
  // cameraForBounds fits a flat view; zoom out a little so the tilted image still fits.
  return { center: cam.center, zoom: cam.zoom - 0.2, pitch: phone() ? 30 : 42, bearing: -12 };
}

function finish() {
  $("#fig").classList.add("in");
  document.documentElement.dataset.introDone = "1";
}

map.on("load", async () => {
  const end = landing();
  if (reducedMotion()) {
    map.jumpTo(end);
    setYear(y1);
    return finish();
  }
  // 1. A gentle turn of the globe towards India.
  map.easeTo({ center: [58, 20], duration: 2200, easing: (t) => t });
  await map.once("moveend");
  // 2. Fly down and tilt into 3D.
  map.flyTo({ ...end, duration: 5200, curve: 1.42, essential: true });
  await map.once("moveend");
  // 3. Land on 2018's land use, then let it change into 2026 once.
  setYear(y0);
  await wait(1100);
  setYear(y1);
  await wait(500);
  finish();
});

// ----- Scroll reveals -----
function countTo(el, from, to, ms, digits = 0) {
  if (reducedMotion()) return;
  const unit = el.querySelector("small")?.outerHTML ?? "";
  const t0 = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - t, 4);
    el.innerHTML = `${(from + (to - from) * e).toFixed(digits)}${unit}`;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
      if (e.target.id === "mReal") {
        // The real number starts at the reported number and drops while the bar shrinks.
        setTimeout(() => countTo($("#realCount"), c.reported_changed_km2, c.estimated_real_changed_km2, 900), 350);
      }
      if (e.target.id === "cols") {
        $$("#cols [data-count]").forEach((el) => countTo(el, 0, Number(el.dataset.count), 600, 1));
      }
    }
  },
  { threshold: 0.45 },
);
io.observe($("#mReal"));
io.observe($("#cols"));
