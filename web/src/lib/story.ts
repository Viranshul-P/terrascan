// The Story page's data (web/public/data/story.json, made by src/web_story.py from results/) and small helpers that
// turn it into what the chapters draw. Plain functions, so the tests can check them without a browser map.
import type { Change, Checks, Patch } from "./types";

export type MeanStd = { mean: number; std: number };

export type StoryData = {
  made_by: string;
  ahmedabad: {
    source: string;
    judged_by: string;
    n_pairs: number;
    counts: { yes: number; no: number; unclear: number };
    real_rate: number;
    real_rate_95: [number, number];
    reported_changed_km2: number;
    estimated_real_changed_km2: number;
    estimated_real_changed_km2_95: [number, number];
  };
  india: {
    source: string;
    seeds: number[];
    n_finetune_patches: number;
    n_india_test_patches: number;
    summary_mean_std_over_seeds: Record<
      "india_test_accuracy_before" | "india_test_accuracy_after" | "eurosat_test_accuracy_before" | "eurosat_test_accuracy_after",
      MeanStd
    >;
  };
  models: {
    note: string;
    items: { name: string; source: string; seeds: number[]; image_size: number; params: number; accuracy: MeanStd; cpu_ms_per_image: MeanStd }[];
  };
};

// "Reported -> real": how long the real bar is (share of the reported bar) and where its 95% range sits, all as
// fractions of the reported amount.
export function shrink(a: StoryData["ahmedabad"]) {
  const r = a.reported_changed_km2;
  const [lo, hi] = a.estimated_real_changed_km2_95;
  return { scale: a.estimated_real_changed_km2 / r, rangeLeft: lo / r, rangeWidth: (hi - lo) / r };
}

// The three accuracy rows of the "Europe -> India" chart (3-seed means and stds; CLAUDE.md: never the seed-42-only
// "before"). key = where the number sits in results/india_after.json.
export function accuracyRows(india: StoryData["india"]) {
  const s = india.summary_mean_std_over_seeds;
  const row = (label: string, key: keyof typeof s, highlight = false) => ({
    label, highlight, value: s[key], key: `summary_mean_std_over_seeds.${key}`,
  });
  return [
    row("Europe test", "eurosat_test_accuracy_before"),
    row("India, before", "india_test_accuracy_before"),
    row("India, after", "india_test_accuracy_after", true),
  ];
}

// For each class: the square the model was most sure about in that year. id = index in patches = map id; row and
// col = its place in the grid, counted in squares (patches.csv's own row/col are pixels, so they are not used).
export function mostSure(patches: Patch[], year: string, gridCols: number) {
  const best: Record<string, { id: number; conf: number; row: number; col: number }> = {};
  patches.forEach((p, id) => {
    const k = p.cls[year], conf = p.conf[year];
    if (!best[k] || conf > best[k].conf) best[k] = { id, conf, row: Math.floor(id / gridCols), col: id % gridCols };
  });
  return best;
}

// The biggest from -> to shifts, and whether they all start from the same class (the text then says so).
export function topShifts(changes: Change[], n = 3) {
  const top = changes.slice(0, n);
  return { top, sameFrom: top.length > 1 && top.every((t) => t.from === top[0].from) ? top[0].from : null };
}

// The most confident changed square for one from -> to shift (where the map pin goes), or null.
export function pinFor(patches: Patch[], [y0, y1]: string[], t: Pick<Change, "from" | "to">) {
  let best: Patch | null = null;
  for (const p of patches) {
    if (p.changed && p.cls[y0] === t.from && p.cls[y1] === t.to && (!best || p.conf[y1] > best.conf[y1])) best = p;
  }
  return best;
}

// The checked squares for the waffle: real changes first, then unclear, then not real.
const ORDER = { yes: 0, unclear: 1, no: 2 } as const;
export const waffleOrder = (squares: Checks["squares"]) => [...squares].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
