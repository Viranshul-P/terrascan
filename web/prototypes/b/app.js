import { loadAll, loadCity, LABEL, km2, pct, patchAt, makeSwipe } from "../shared/data.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function fillImages(city) {
  for (const img of $$("[data-rgb]")) img.src = city.base + city.summary.files.rgb[img.dataset.rgb];
  for (const img of $$("[data-ov]")) img.src = city.base + city.summary.files.overlay[img.dataset.ov];
}

const d = await loadAll();
const [y0, y1] = d.index.years;
$$("[data-y0]").forEach((el) => (el.textContent = y0));
$$("[data-y1]").forEach((el) => (el.textContent = y1));
$$("[data-rate]").forEach((el) => (el.textContent = pct(d.check.final.real_rate, 0)));
// Landing starts the swipe right of the headline so the line never cuts through the text.
makeSwipe($("#stage"), $("#handle"), $("#cols") && innerWidth > 900 ? 64 : 50);

if ($("#cols")) {
  $("[data-reported]").textContent = km2(d.check.reported_changed_km2);
  $("[data-real]").textContent = km2(d.check.estimated_real_changed_km2);
  $("[data-n]").textContent = d.check.n_pairs;
  fillImages(d.city);

  $("#key").innerHTML = d.index.classes
    .map((c) => `<li><i style="background:${c.colour}"></i>${LABEL[c.name]}</li>`)
    .join("");
  // 5 km scale bar: the image spans grid_cols patches of 640 m.
  const s = d.city.summary;
  const kmWide = s.grid_cols * Math.sqrt(s.km2_per_patch);
  const setScale = () => ($("#scale").style.width = `${($("#frame").offsetWidth / kmWide) * 5}px`);
  setScale();
  addEventListener("resize", setScale);

  const r = d.india;
  const cols = [
    [r.eurosat_test_accuracy_before, ""],
    [r.india_test_accuracy_before, ""],
    [r.india_test_accuracy_after, "hl"],
  ];
  $("#cols").innerHTML = cols
    .map(([v, cls]) => `<div class="col ${cls}"><div class="v">${pct(v.mean)}<small>%</small></div>
      <div class="bar" style="--h:${v.mean * 100}%"><i class="err" style="--lo:${((v.mean - v.std) / v.mean) * 100}%;--span:${((2 * v.std) / v.mean) * 100}%"></i></div></div>`)
    .join("");
}

if ($("#cities")) {
  let city = d.city;
  const tip = $("#tip");
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
  const sw = $("#conf");
  sw.addEventListener("click", () => sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")));
  $("#legend").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });

  $("#stage").addEventListener("pointermove", (e) => {
    if (e.target.closest(".panel, .handle, .top")) return (tip.hidden = true);
    const f = $("#frame").getBoundingClientRect();
    const s = $("#stage").getBoundingClientRect();
    const p = patchAt(city, (e.clientX - f.left) / f.width, (e.clientY - f.top) / f.height);
    tip.hidden = false;
    tip.style.left = `${e.clientX - s.left}px`;
    tip.style.top = `${e.clientY - s.top}px`;
    tip.innerHTML = `<b>${LABEL[p[`class_${y1}`]]}</b><span>${pct(Number(p[`confidence_${y1}`]), 0)}% sure · ${y1}</span><br>
      <span>${y0}: ${LABEL[p[`class_${y0}`]]}${p.changed === "True" ? " · changed" : ""}</span>`;
  });

  function render() {
    fillImages(city);
    const a0 = city.summary.areas_km2[y0], a1 = city.summary.areas_km2[y1];
    $("#legend").innerHTML = d.index.classes
      .map((c) => `<li><button type="button" aria-pressed="true"><span class="sw" style="background:${c.colour}"></span>
        <span>${LABEL[c.name]}</span><span class="v">${km2(a0[c.name])} → <b>${km2(a1[c.name])}</b></span></button></li>`)
      .join("");
    $("#changes").innerHTML = city.summary.changes
      .slice(0, 5)
      .map((c) => `<li><span>${LABEL[c.from]} → ${LABEL[c.to]}</span><span>${km2(c.km2)} km²</span></li>`)
      .join("");
  }
  render();
}
