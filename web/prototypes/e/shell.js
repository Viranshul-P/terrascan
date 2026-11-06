// Shared page shell for prototype E: header (nav, Cities menu, theme switch), mobile menu, footer,
// source markers (ⓘ) and scroll reveals. Each page calls initShell({ page }).
import { LABEL, km2 } from "../shared/data.js";

const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;
const DATA = "../../public/data/";
export const REPO = "https://github.com/Viranshul-P/terrascan";
export const DATASET = "https://huggingface.co/datasets/viranshul/terrascan-india-gujarat";
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const themeListeners = [];
export const onThemeChange = (fn) => themeListeners.push(fn);

// Logomark: a 3 x 3 grid of 640 m patches, one of them flagged. Drawn, not an icon font.
const LOGO = `<svg viewBox="0 0 22 22" aria-hidden="true">
  ${[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => {
    const flag = r === 0 && c === 2;
    return `<rect x="${1 + c * 7}" y="${1 + r * 7}" width="6" height="6" rx="1.5" fill="${flag ? "var(--accent-fill)" : "currentColor"}" opacity="${flag ? 1 : 0.22 + (r + c) * 0.13}"/>`;
  })).join("")}
</svg>`;
const ICON = {
  chev: `<svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 4.5 3 3 3-3"/></svg>`,
  sun: `<svg class="sun" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 1.5v2M10 16.5v2M3.99 3.99l1.41 1.41M14.6 14.6l1.41 1.41M1.5 10h2M16.5 10h2M3.99 16.01l1.41-1.41M14.6 5.4l1.41-1.41"/></svg>`,
  moon: `<svg class="moon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7Z"/></svg>`,
  gh: `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>`,
  menu: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 6h14M3 10h14M3 14h14"/></svg>`,
  arrow: `<svg class="arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`,
};
export { ICON };

// A source marker for a number: which file it came from, which key, and a one-line note.
export const src = (file, key, note = "") =>
  `<button class="src" type="button" aria-label="Source" aria-expanded="false" data-file="${file}" data-key="${key}" data-note="${note}">i</button>`;

function header(page) {
  const link = (id, href, text) => `<a href="${href}"${page === id ? ' aria-current="page"' : ""}>${text}</a>`;
  return `<header class="nav${page === "explorer" ? " always-solid" : ""}" id="nav">
    <div class="nav-in">
      <a class="brand" href="index.html" aria-label="TerraScan home">${LOGO}<span>TerraScan</span></a>
      <nav class="links" aria-label="Main">
        ${link("story", "index.html", "Story")}
        ${link("explorer", "explorer.html", "Explorer")}
        <button type="button" id="citiesBtn" aria-expanded="false" aria-controls="citiesMenu">Cities ${ICON.chev}</button>
        ${link("method", "method.html", "Method")}
        ${link("limits", "method.html#limits", "Limits")}
      </nav>
      <div class="tools">
        <a class="gh" href="${REPO}" rel="noopener">${ICON.gh}<span class="gh-label">GitHub</span></a>
        <button class="icon-btn theme-btn" id="themeBtn" type="button">${ICON.sun}${ICON.moon}</button>
        <button class="icon-btn burger" id="burger" type="button" aria-label="Menu" aria-expanded="false">${ICON.menu}</button>
      </div>
    </div>
  </header>
  <div class="menu" id="citiesMenu" role="menu" aria-label="Cities">
    <div class="menu-grid" id="citiesGrid"></div>
    <div class="menu-foot"><span>Pre-computed showcase. Opens in the Explorer.</span><a href="explorer.html#own">Map your own area →</a></div>
  </div>
  <nav class="sheet-nav" id="sheetNav" aria-label="Main">
    <a href="index.html">Story</a><a href="explorer.html">Explorer</a><a href="method.html">Method</a>
    <a href="method.html#limits">Limits</a><a href="${REPO}">GitHub</a>
  </nav>`;
}

function footer() {
  const year = new Date().getFullYear();
  return `<footer class="foot">
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <a class="brand" href="index.html">${LOGO}<span>TerraScan</span></a>
          <p>A land-use model for satellite images, tested honestly on Indian cities.</p>
        </div>
        <div><h4>Explore</h4><ul>
          <li><a href="index.html">Story</a></li><li><a href="explorer.html">Explorer</a></li>
          <li><a href="explorer.html#own">Map your own area</a></li></ul></div>
        <div><h4>Project</h4><ul>
          <li><a href="method.html">Method</a></li><li><a href="method.html#limits">Limits</a></li>
          <li><a href="${REPO}">Source code</a></li><li><a href="${DATASET}">Indian dataset</a></li>
          <li><span class="soon">Model card (soon)</span></li></ul></div>
        <div><h4>Credits</h4><ul>
          <li>Images: modified Copernicus Sentinel-2 data</li>
          <li>Globe: NASA Blue Marble via NASA GIBS</li>
          <li>Map: MapLibre GL</li>
          <li>Built by Viranshul-P with Claude (Anthropic) as coding assistant</li></ul></div>
      </div>
      <div class="foot-base"><span>© ${year} TerraScan · Prototype for design review</span>
        <span>Every number on this site links to the file it came from.</span></div>
    </div>
  </footer>`;
}

async function fillCities() {
  const index = await (await fetch(`${DATA}index.json`)).json();
  const sums = await Promise.all(index.cities.map((c) => fetch(DATA + c.summary).then((r) => r.json())));
  $("#citiesGrid").innerHTML = index.cities
    .map((c, i) => {
      const s = sums[i];
      return `<a class="city-item" role="menuitem" href="explorer.html?city=${c.id}">
        <span class="city-thumb" style="background-image:url(${DATA}${c.id}/${s.files.overlay[index.years[1]]});image-rendering:pixelated"></span>
        <span><b>${c.name}</b><span>${km2(s.changed_km2)} km² reported change</span><span class="mono">${s.n_patches.toLocaleString("en-US")} squares · tile ${s.tile}</span></span>
      </a>`;
    })
    .join("");
}

function wireMenu() {
  const btn = $("#citiesBtn"), menu = $("#citiesMenu");
  let loaded = false;
  const set = (open) => {
    btn.setAttribute("aria-expanded", String(open));
    menu.dataset.open = String(open);
    if (open) {
      const r = btn.getBoundingClientRect();
      menu.style.left = `${Math.max(16, r.left - 8)}px`;
      if (!loaded) { loaded = true; fillCities(); }
    }
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(menu.dataset.open !== "true"); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) set(false); });
  document.addEventListener("keydown", (e) => e.key === "Escape" && set(false));
  const burger = $("#burger"), sheet = $("#sheetNav");
  burger.addEventListener("click", () => {
    const open = sheet.dataset.open !== "true";
    sheet.dataset.open = String(open);
    burger.setAttribute("aria-expanded", String(open));
  });
}

function wireTheme() {
  const btn = $("#themeBtn");
  const label = () => btn.setAttribute("aria-label", root.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  const apply = (t, save) => {
    root.dataset.theme = t;
    if (save) try { localStorage.setItem("theme", t); } catch { /* not remembered in private mode */ }
    label();
    themeListeners.forEach((fn) => fn(t));
  };
  label();
  btn.addEventListener("click", () => apply(root.dataset.theme === "dark" ? "light" : "dark", true));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let saved = null;
    try { saved = localStorage.getItem("theme"); } catch { /* ignore */ }
    if (!saved) apply(e.matches ? "dark" : "light", false);
  });
}

function wireSources() {
  const pop = document.createElement("div");
  pop.className = "src-pop";
  pop.setAttribute("role", "dialog");
  document.body.append(pop);
  let current = null;
  const close = () => { pop.dataset.open = "false"; current?.setAttribute("aria-expanded", "false"); current = null; };
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".src");
    if (!b) { if (!pop.contains(e.target)) close(); return; }
    e.stopPropagation();
    if (current === b) return close();
    close();
    current = b;
    b.setAttribute("aria-expanded", "true");
    pop.innerHTML = `<span class="label">Source</span><code>${b.dataset.file}</code>
      <p><span class="mono">${b.dataset.key}</span>${b.dataset.note ? `<br>${b.dataset.note}` : ""}</p>`;
    const r = b.getBoundingClientRect();
    pop.style.left = `${Math.min(innerWidth - pop.offsetWidth - 12, Math.max(12, r.left - 12))}px`;
    pop.style.top = `${r.bottom + 8 + pop.offsetHeight > innerHeight ? r.top - pop.offsetHeight - 8 : r.bottom + 8}px`;
    pop.dataset.open = "true";
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  addEventListener("scroll", close, { passive: true });
}

export function observeReveals(rootEl = document) {
  if (reducedMotion()) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  rootEl.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

// One soft highlight slides between the nav links as the pointer moves over them (instead of each link lighting up).
function wirePill() {
  const links = $(".links");
  if (!links || reducedMotion()) return;
  const pill = document.createElement("span");
  pill.className = "pill";
  links.prepend(pill);
  links.addEventListener("pointerover", (e) => {
    const t = e.target.closest("a, button");
    if (!t) return;
    const first = !links.dataset.hover;
    pill.style.transition = first ? "opacity 200ms" : "";
    pill.style.transform = `translateX(${t.offsetLeft}px)`;
    pill.style.width = `${t.offsetWidth}px`;
    links.dataset.hover = "1";
  });
  links.addEventListener("pointerleave", () => delete links.dataset.hover);
}

export function initShell({ page }) {
  if (!reducedMotion()) root.classList.add("motion");
  document.body.insertAdjacentHTML("afterbegin", header(page));
  const slot = document.getElementById("footer");
  if (slot) slot.outerHTML = footer();
  wireMenu();
  wirePill();
  wireTheme();
  wireSources();
  observeReveals();
  // The bar turns solid once the page scrolls (the Explorer keeps it solid).
  const nav = $("#nav");
  const solid = () => (nav.dataset.solid = String(scrollY > 8));
  solid();
  addEventListener("scroll", solid, { passive: true });
}

export { LABEL };
