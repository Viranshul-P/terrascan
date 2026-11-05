import { loadAll, loadCity, LABEL, km2, pct, patchAt, strongestChanges, makeSwipe } from "../shared/data.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function fillImages(city, root = document) {
  for (const img of $$("[data-rgb]", root)) img.src = city.base + city.summary.files.rgb[img.dataset.rgb];
  for (const img of $$("[data-ov]", root)) img.src = city.base + city.summary.files.overlay[img.dataset.ov];
}

function fillCommon(d) {
  const [y0, y1] = d.index.years;
  $$("[data-y0]").forEach((el) => (el.textContent = y0));
  $$("[data-y1]").forEach((el) => (el.textContent = y1));
  $$("[data-rate]").forEach((el) => (el.textContent = pct(d.check.final.real_rate, 0)));
}

function landing(d) {
  const reported = d.check.reported_changed_km2;
  const real = d.check.estimated_real_changed_km2;
  $("[data-reported]").textContent = km2(reported);
  $("[data-real]").textContent = km2(real);
  $("[data-n]").textContent = d.check.n_pairs;
  $("[data-real-bar]").style.setProperty("--w", `${(real / reported) * 100}%`);

  fillImages(d.city);
  makeSwipe($("#plate"), $("#handle"), 50);

  // Marks 1-3: real changed patches (farmland -> industrial), placed on the 2026 side only when visible.
  const frame = $("#frame");
  strongestChanges(d.city, "AnnualCrop", "Industrial", 3, 6, [0.16, 0.24, 0.88, 0.68]).forEach((p, i) => {
    const m = document.createElement("div");
    m.className = "mark";
    m.style.left = `${p.fx * 100}%`;
    m.style.top = `${p.fy * 100}%`;
    m.innerHTML = `<b>${i + 1}</b>`;
    frame.append(m);
  });

  const s = d.india;
  const rows = [
    ["Europe", s.eurosat_test_accuracy_before, ""],
    ["India, before", s.india_test_accuracy_before, ""],
    ["India, after", s.india_test_accuracy_after, "after"],
  ];
  $("#dots").innerHTML = rows
    .map(([name, v, cls]) => {
      const lo = (v.mean - v.std) * 100, hi = (v.mean + v.std) * 100;
      return `<div class="dot-row ${cls}"><span class="name">${name}</span>
        <span class="axis"><i class="whisk" style="left:${lo}%;width:${hi - lo}%"></i><i class="pt" style="left:${v.mean * 100}%"></i></span>
        <span class="val">${pct(v.mean)}%</span></div>`;
    })
    .join("");
}

async function mapView(d) {
  let city = d.city;
  const plate = $("#mapPlate");
  const tip = $("#tip");
  makeSwipe(plate, $("#handle"), 50);

  // City picker
  $("#cities").innerHTML = d.index.cities
    .map((c) => `<button type="button" data-city="${c.id}" aria-pressed="${c.id === city.id}">${c.name}</button>`)
    .join("");
  $("#cities").addEventListener("click", async (e) => {
    const id = e.target.closest("button")?.dataset.city;
    if (!id || id === city.id) return;
    $$("#cities button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.city === id)));
    city = await loadCity(id);
    render();
  });

  // Confidence toggle (prototype: dims low-confidence look by lowering overlay opacity)
  const sw = $("#conf");
  sw.addEventListener("click", () => sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")));

  // Hover a patch
  plate.addEventListener("pointermove", (e) => {
    if (e.target.closest(".handle")) return (tip.hidden = true);
    const r = plate.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const p = patchAt(city, fx, fy);
    const y1 = d.index.years[1], y0 = d.index.years[0];
    tip.hidden = false;
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    tip.innerHTML = `<b>${LABEL[p[`class_${y1}`]]}</b><span>${pct(Number(p[`confidence_${y1}`]), 0)}% sure · ${y1}</span><br>
      <span>${y0}: ${LABEL[p[`class_${y0}`]]}${p.changed === "True" ? " · changed" : ""}</span>`;
  });
  plate.addEventListener("pointerleave", () => (tip.hidden = true));

  function render() {
    fillImages(city, plate);
    const [y0, y1] = d.index.years;
    const a0 = city.summary.areas_km2[y0], a1 = city.summary.areas_km2[y1];
    const max = Math.max(...Object.values(a0), ...Object.values(a1));
    $("#legend").innerHTML = d.index.classes
      .map((c) => `<li><span class="sw" style="background:${c.colour}"></span><span>${LABEL[c.name]}</span>
        <span class="v">${km2(a0[c.name])} → <b>${km2(a1[c.name])}</b> km²</span>
        <span class="bars"><i style="width:${(a0[c.name] / max) * 100}%"></i><i style="width:${(a1[c.name] / max) * 100}%"></i></span></li>`)
      .join("");
    $("#changes").innerHTML = city.summary.changes
      .slice(0, 5)
      .map((c) => `<li><span>${LABEL[c.from]} → ${LABEL[c.to]}</span><span>${km2(c.km2)} km²</span></li>`)
      .join("");
    $("#cityName").textContent = city.summary.name;
  }
  render();
}

const d = await loadAll();
fillCommon(d);
if ($("#plate")) landing(d);
if ($("#mapPlate")) mapView(d);
