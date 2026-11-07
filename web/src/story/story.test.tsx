// Tests for the Story page (step 5.3c): the helpers in lib/story.ts, and the chapters rendered with made-up numbers
// (every number on screen must come from the data, never typed into the page). The map needs WebGL, which the test
// browser doesn't have, so the map itself is checked with screenshots instead.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import realStoryFile from "../../public/data/story.json?raw";
import { accuracyRows, mostSure, pinFor, shrink, topShifts, waffleOrder, type StoryData } from "../lib/story";
import type { Checks, City, Patch, Summary } from "../lib/types";
import { EuropeIndia, Hero, HowSure, Limits, TheCity, WhatChanged, WhatItSees, type Ctx } from "./Chapters";

const YEARS = ["2018", "2026"];
const patch = (cls0: string, cls1: string, conf1: number, changed = cls0 !== cls1, lon = 72): Patch =>
  ({ row: 0, col: 0, lon, lat: 23, changed, cls: { 2018: cls0, 2026: cls1 }, conf: { 2018: 0.5, 2026: conf1 } });

// Made-up numbers that appear nowhere in the code, so finding them on screen proves they came from the data.
const STORY: StoryData = {
  made_by: "test",
  ahmedabad: {
    source: "results/change_check.json", judged_by: "a tester", n_pairs: 7, counts: { yes: 3, no: 3, unclear: 1 },
    real_rate: 0.4286, real_rate_95: [0.1, 0.8], reported_changed_km2: 777, estimated_real_changed_km2: 333, estimated_real_changed_km2_95: [222, 444],
  },
  india: {
    source: "results/india_after.json", seeds: [42, 43, 44], n_finetune_patches: 123, n_india_test_patches: 45,
    summary_mean_std_over_seeds: {
      india_test_accuracy_before: { mean: 0.4111, std: 0.01 }, india_test_accuracy_after: { mean: 0.6222, std: 0.02 },
      eurosat_test_accuracy_before: { mean: 0.9777, std: 0.001 }, eurosat_test_accuracy_after: { mean: 0.9666, std: 0.001 },
    },
  },
  models: { note: "", items: [] },
};
const SUMMARY = {
  id: "ahmedabad", name: "Ahmedabad", grid_rows: 2, grid_cols: 2, n_patches: 4321, changed_patches: 876,
  years: { 2018: { n_scenes: 17, window: "" }, 2026: { n_scenes: 19, window: "" } },
  changes: [{ from: "AnnualCrop", to: "Residential", patches: 5, km2: 55 }, { from: "AnnualCrop", to: "Industrial", patches: 4, km2: 44 }, { from: "AnnualCrop", to: "Highway", patches: 3, km2: 33 }],
  files: { rgb: { 2018: "rgb_2018.webp", 2026: "rgb_2026.webp" } },
} as unknown as Summary;
const PATCHES = [patch("AnnualCrop", "Residential", 0.9), patch("AnnualCrop", "Residential", 0.95, true, 73), patch("Forest", "Forest", 0.8), patch("AnnualCrop", "Industrial", 0.7)];
const CHECKS = { judged_by: "", n_pairs: 3, real_rate: 0, squares: [
  { pair: "p1", id: 0, lon: 72, lat: 23, verdict: "no" }, { pair: "p2", id: 1, lon: 72, lat: 23, verdict: "yes" }, { pair: "p3", id: 2, lon: 72, lat: 23, verdict: "unclear" },
] } as Checks;

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    city: { id: "ahmedabad", base: "/data/ahmedabad/", summary: SUMMARY, patches: PATCHES } as City,
    story: STORY, checks: CHECKS, years: YEARS, colour: { AnnualCrop: "#e6c84a", Residential: "#d73027", Forest: "#1b7837", Industrial: "#762a83", Highway: "#7f7f7f" },
    on: () => true, seen: () => true, onSquare: () => {}, onShift: () => {}, ...over,
  };
}

describe("story helpers", () => {
  it("shrink: the real bar and its 95% range as shares of the reported amount", () => {
    const f = shrink(STORY.ahmedabad);
    expect(f.scale).toBeCloseTo(333 / 777);
    expect(f.rangeLeft).toBeCloseTo(222 / 777);
    expect(f.rangeWidth).toBeCloseTo(222 / 777);
  });

  it("accuracyRows uses the 3-seed summary keys, India-after highlighted", () => {
    const rows = accuracyRows(STORY.india);
    expect(rows.map((r) => r.key)).toEqual([
      "summary_mean_std_over_seeds.eurosat_test_accuracy_before",
      "summary_mean_std_over_seeds.india_test_accuracy_before",
      "summary_mean_std_over_seeds.india_test_accuracy_after",
    ]);
    expect(rows[1].value.mean).toBe(0.4111);
    expect(rows.map((r) => r.highlight)).toEqual([false, false, true]);
  });

  it("mostSure picks the most confident square per class, with its place in the grid", () => {
    // 4 squares in a 2 x 2 grid: square 1 is row 0, col 1; square 3 is row 1, col 1.
    expect(mostSure(PATCHES, "2026", 2).Residential).toMatchObject({ id: 1, row: 0, col: 1 });
    expect(mostSure(PATCHES, "2026", 2).Industrial).toMatchObject({ id: 3, row: 1, col: 1 });
  });

  it("topShifts says when all the biggest shifts start from the same class", () => {
    expect(topShifts(SUMMARY.changes).sameFrom).toBe("AnnualCrop");
    expect(topShifts([...SUMMARY.changes.slice(0, 1), { from: "Forest", to: "Residential", patches: 1, km2: 1 }]).sameFrom).toBeNull();
  });

  it("pinFor finds the most confident changed square of a shift, or nothing", () => {
    expect(pinFor(PATCHES, YEARS, { from: "AnnualCrop", to: "Residential" })?.lon).toBe(73);
    expect(pinFor(PATCHES, YEARS, { from: "Forest", to: "River" })).toBeNull();
  });

  it("waffleOrder puts real changes first, then unclear, then not real", () => {
    expect(waffleOrder(CHECKS.squares).map((q) => q.verdict)).toEqual(["yes", "unclear", "no"]);
  });
});

describe("chapters show the numbers from the data", () => {
  it("hero: squares, km² flagged and share that held up", () => {
    render(<Hero ctx={ctx()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("How much of Ahmedabad really changed?");
    for (const t of ["4,321", "777", "43"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });

  it("the city: scene counts per year", () => {
    render(<TheCity ctx={ctx()} />);
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("19").length).toBeGreaterThan(0);
  });

  it("what the model sees: pointing at a square shows it on the map", async () => {
    const onSquare = vi.fn();
    render(<WhatItSees ctx={ctx({ onSquare })} />);
    await userEvent.hover(screen.getByRole("button", { name: /Housing, 95% sure/ }));
    expect(onSquare).toHaveBeenCalledWith(1);
  });

  it("what changed: counts and the biggest shifts, which filter the map", async () => {
    const onShift = vi.fn();
    render(<WhatChanged ctx={ctx({ onShift })} />);
    expect(screen.getAllByText("876").length).toBeGreaterThan(0);
    expect(screen.getByText(/all start as farmland/)).toBeInTheDocument();
    await userEvent.hover(screen.getByRole("button", { name: /Farmland → Industrial/ }));
    expect(onShift).toHaveBeenCalledWith(expect.objectContaining({ from: "AnnualCrop", to: "Industrial" }));
  });

  it("how sure: reported -> real, its range, who checked, and every checked square", () => {
    const { container } = render(<HowSure ctx={ctx()} />);
    for (const t of ["777", "333", "43%"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    expect(screen.getByText(/222–444/)).toBeInTheDocument();
    expect(screen.getByText(/a tester/)).toBeInTheDocument();
    expect(container.querySelectorAll(".waffle i")).toHaveLength(3);
  });

  it("Europe -> India: the 3-seed accuracies and the fine-tuning set size", () => {
    render(<EuropeIndia ctx={ctx()} />);
    for (const t of ["97.8", "41.1", "62.2", "123"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });

  it("limits: the share that held up comes from the data", () => {
    render(<Limits ctx={ctx()} />);
    expect(screen.getByText(/Only 43%/)).toBeInTheDocument();
  });
});

describe("the real story.json", () => {
  it("has every field the page reads", () => {
    const s = JSON.parse(realStoryFile) as StoryData;
    expect(s.made_by).toBe("src/web_story.py");
    expect(s.ahmedabad.reported_changed_km2).toBeGreaterThan(s.ahmedabad.estimated_real_changed_km2);
    expect(s.ahmedabad.estimated_real_changed_km2_95).toHaveLength(2);
    expect(Object.keys(s.india.summary_mean_std_over_seeds).sort()).toEqual(
      ["eurosat_test_accuracy_after", "eurosat_test_accuracy_before", "india_test_accuracy_after", "india_test_accuracy_before"]);
    expect(s.india.seeds).toEqual([42, 43, 44]);
  });
});
