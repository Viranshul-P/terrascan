// Method page (prototype D): all figures computed from results/*.json, with source markers.
import { pct } from "../shared/data.js";
import { initShell, src, observeReveals } from "./shell.js";

initShell({ page: "method" });
const $ = (s) => document.querySelector(s);
const R = "../../../results/";
const get = (f) => fetch(R + f).then((r) => r.json());

const MODELS = [
  ["small_cnn_v1", "SmallCNN v1", "from scratch"],
  ["small_cnn_v2", "SmallCNN v2", "from scratch"],
  ["resnet18", "ResNet-18", "ImageNet-pretrained"],
  ["efficientnet_b0", "EfficientNet-B0", "ImageNet-pretrained"],
  ["resnet18_sat", "ResNet-18", "satellite-pretrained"],
];
const CHOSEN = "efficientnet_b0";

const [models, india, ds, labels, check, index] = await Promise.all([
  Promise.all(MODELS.map(([id]) => get(`${id}.json`))),
  get("india_after.json"),
  get("india_dataset.json"),
  get("india_labels.json"),
  get("change_check.json"),
  fetch("../../public/data/index.json").then((r) => r.json()),
]);

// mean and sample std over seeds (same as results/comparison.md)
const stats = (vals) => {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1)) : 0;
  return { m, sd, n: vals.length };
};
const rows = MODELS.map(([id, name, kind], i) => {
  const seeds = Object.values(models[i].seeds);
  return {
    id, name, kind, seeds: Object.keys(models[i].seeds),
    acc: stats(seeds.map((s) => s.accuracy)), f1: stats(seeds.map((s) => s.macro_f1)),
    ms: stats(seeds.map((s) => s.cpu_ms_per_image)), params: seeds[0].params, size: seeds[0].image_size,
  };
});
const eff = rows.find((r) => r.id === CHOSEN);

// ---------- Spec sheet ----------
const spec = [
  ["Satellite", "Sentinel-2 L2A · RGB · 10 m"],
  ["One square", "64 × 64 px · 640 × 640 m"],
  ["Classes", `${index.classes.length}${src("web/public/data/index.json", "classes")}`],
  ["Model", `EfficientNet-B0 · ${(eff.params / 1e6).toFixed(1)} M params${src("results/efficientnet_b0.json", "seeds.42.params")}`],
  ["Input size", `64 → ${eff.size} px`],
  ["Speed", `${eff.ms.m.toFixed(1)} ms / square, 1 CPU thread${src("results/efficientnet_b0.json", "seeds.*.cpu_ms_per_image", "Model only, batch 1, median of 200 runs.")}`],
  ["Fine-tuning data", `${ds.per_split.train} Indian squares${src("results/india_dataset.json", "per_split.train")}`],
  ["Maps made with", index.model],
];
$("#spec").innerHTML = spec.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

// ---------- Comparison table ----------
const COLS = [
  { key: "name", label: "Model", sort: (r) => r.name },
  { key: "acc", label: "Test accuracy", sort: (r) => r.acc.m },
  { key: "f1", label: "Macro-F1", sort: (r) => r.f1.m },
  { key: "ms", label: "CPU ms / image", sort: (r) => r.ms.m },
  { key: "params", label: "Parameters", sort: (r) => r.params },
  { key: "seeds", label: "Runs", sort: (r) => r.seeds.length },
];
let sortKey = "acc", dir = -1;
const lo = 0.95, hi = 1.0; // accuracy axis for the bars
const bar = (s) => `<div class="cellbar"><span class="track"><i style="--w:${((s.m - lo) / (hi - lo)) * 100}%"></i>
  <u style="--lo:${((s.m - s.sd - lo) / (hi - lo)) * 100}%;--sd:${((2 * s.sd) / (hi - lo)) * 100}%"></u></span>
  <span>${pct(s.m, 2)}%${s.n > 1 ? ` ± ${pct(s.sd, 2)}` : " (1 run)"}</span></div>`;
function renderTable() {
  const sorted = [...rows].sort((a, b) => {
    const c = COLS.find((x) => x.key === sortKey).sort;
    return (c(a) > c(b) ? 1 : c(a) < c(b) ? -1 : 0) * dir;
  });
  $("#tbl").innerHTML = `<thead><tr>${COLS.map((c) => `<th scope="col"><button data-k="${c.key}" aria-sort="${c.key === sortKey ? (dir < 0 ? "descending" : "ascending") : "none"}">${c.label}</button></th>`).join("")}</tr></thead>
    <tbody>${sorted.map((r) => `<tr class="${r.id === CHOSEN ? "chosen" : ""}">
      <td><span class="name">${r.name}</span>${r.id === CHOSEN ? `<span class="tag">Used for the maps</span>` : ""}<span class="sub">${r.kind}</span></td>
      <td class="num">${bar(r.acc)}</td>
      <td class="num">${pct(r.f1.m, 2)}%</td>
      <td class="num">${r.ms.m.toFixed(2)}</td>
      <td class="num">${r.params.toLocaleString("en-US")}</td>
      <td class="num">${r.seeds.length}${src(`results/${r.id}.json`, "seeds", `Seeds ${r.seeds.join(", ")}`)}</td></tr>`).join("")}</tbody>`;
}
$("#tbl").addEventListener("click", (e) => {
  const b = e.target.closest("th button");
  if (!b) return;
  if (b.dataset.k === sortKey) dir = -dir; else { sortKey = b.dataset.k; dir = b.dataset.k === "ms" || b.dataset.k === "name" ? 1 : -1; }
  renderTable();
});
renderTable();
const v2 = rows.find((r) => r.id === "small_cnn_v2");
const overlap = Math.max(v2.acc.m - v2.acc.sd, eff.acc.m - eff.acc.sd) <= Math.min(v2.acc.m + v2.acc.sd, eff.acc.m + eff.acc.sd);
$("#tblNote").innerHTML = `${overlap ? `<b>SmallCNN v2, built from scratch, is about as accurate as EfficientNet-B0:</b> their ranges (mean ± std) overlap, so neither is called better.` : ""}
  Bars start at 95%. Std is over training runs (seeds 42, 43, 44). Source: <span class="mono">results/&lt;model&gt;.json</span>, table also in <span class="mono">results/comparison.md</span>.`;

// ---------- Europe -> India ----------
const s = india.summary_mean_std_over_seeds;
$("#indiaStats").innerHTML = [
  ["Europe test", s.eurosat_test_accuracy_before, "eurosat_test_accuracy_before", ""],
  ["India test, before fine-tuning", s.india_test_accuracy_before, "india_test_accuracy_before", ""],
  [`India test, after fine-tuning on ${ds.per_split.train} squares`, s.india_test_accuracy_after, "india_test_accuracy_after", "hl"],
].map(([l, v, k, cls]) => `<div class="stat reveal ${cls}"><div class="v">${pct(v.mean)}<small>% ± ${pct(v.std)}</small></div>
  <div class="l">${l}${src("results/india_after.json", `summary_mean_std_over_seeds.${k}`, "EfficientNet-B0, seeds 42/43/44, mean ± std.")}</div></div>`).join("");

// ---------- Limits + credits ----------
$("#limitChange").innerHTML = `In Ahmedabad only ${pct(check.final.real_rate, 0)}% of ${check.n_pairs} checked changes were real${src("results/change_check.json", "final.real_rate")}. Vadodara, Surat and Rajkot were not checked, so treat their change numbers as upper bounds.`;
$("#creditUser").innerHTML = [
  "Chose the project and approved the plan and every step",
  `Reviewed Claude's Indian labels (kept all ${labels.user_agreed_with_claude_label}) and labelled ${labels.user_changed} squares Claude had skipped${src("results/india_labels.json", "user_agreed_with_claude_label, user_changed, changes", "Every change was skip → class.")}`,
  `Reviewed the change check: changed ${check.n_changed_by_user} of ${check.n_pairs} answers${src("results/change_check.json", "n_changed_by_user")}`,
  "Published the Indian dataset on Hugging Face",
].map((t) => `<li><span>${t}</span></li>`).join("");
$("#creditClaude").innerHTML = [
  "Wrote the code step by step, each step planned with and approved by the author",
  `Labelled ${labels.claude_labelled} Indian squares first, blind to the model${src("results/india_labels.json", "claude_labelled")}`,
  "Did the first pass of the change check, without seeing the model's answers",
  "Designed and built this website prototype",
].map((t) => `<li><span>${t}</span></li>`).join("");
observeReveals();
