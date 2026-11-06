// Tests for the Explorer's data parsing and panels (step 5.3b). The map itself needs WebGL, which the test browser
// (jsdom) doesn't have, so it is checked with screenshots instead (web/scripts/shoot-explorer.mjs).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { cityBounds, parsePatches } from "../lib/city";
import type { City, Summary } from "../lib/types";
import { Inspector } from "./Inspector";
import { LayersPanel, type Layers } from "./LayersPanel";

const YEARS = ["2018", "2026"];
const CSV = `row,col,lon,lat,class_2018,confidence_2018,class_2026,confidence_2026,changed,touches_finetune_area
0,0,72.398301,23.147077,Pasture,0.901,Pasture,0.705,False,False
0,1,72.404545,23.147180,AnnualCrop,0.8,Industrial,0.93,True,False`;

describe("parsePatches", () => {
  it("reads every square with its class and confidence per year", () => {
    const p = parsePatches(CSV, YEARS);
    expect(p).toHaveLength(2);
    expect(p[1]).toEqual({ row: 0, col: 1, lon: 72.404545, lat: 23.14718, changed: true,
      cls: { 2018: "AnnualCrop", 2026: "Industrial" }, conf: { 2018: 0.8, 2026: 0.93 } });
    expect(p[0].changed).toBe(false);
  });

  it("also reads Windows line endings", () => {
    expect(parsePatches(CSV.replace(/\n/g, "\r\n"), YEARS)[1].changed).toBe(true);
  });
});

describe("cityBounds", () => {
  it("is the box around the picture's four corners", () => {
    const summary = { overlay_corners: [[72.39, 23.15], [72.69, 23.16], [72.7, 22.9], [72.4, 22.89]] } as unknown as Summary;
    expect(cityBounds(summary)).toEqual([[72.39, 22.89], [72.7, 23.16]]);
  });
});

const layers: Layers = { sat: true, land: true, opacity: 0.6, conf: false, change: false, checks: false };
const panelProps = {
  layers, setLayers: vi.fn(), legendTitle: "Land use, 2026",
  legend: [{ key: "AnnualCrop", colour: "#e6c84a", value: 128, delta: -94 }],
  active: null, onToggleClass: vi.fn(), onShowAll: vi.fn(), onPreview: vi.fn(),
  changes: [{ from: "AnnualCrop", to: "Industrial", patches: 98, km2: 40.1 }],
  changedPatches: 780, pair: null, onPair: vi.fn(), checksCount: 50,
  summaryFile: "web/public/data/ahmedabad/summary.json", hidden: false, onHide: vi.fn(),
};

describe("LayersPanel", () => {
  it("picking a biggest change shows only those squares", async () => {
    const setLayers = vi.fn(), onPair = vi.fn();
    render(<LayersPanel {...panelProps} setLayers={setLayers} onPair={onPair} />);
    await userEvent.click(screen.getByRole("button", { name: /Farmland → Industrial/ }));
    expect(onPair).toHaveBeenCalledWith({ from: "AnnualCrop", to: "Industrial" });
    expect(setLayers).toHaveBeenCalledWith({ ...layers, change: true });
  });

  it("can't show hand checks for a city that wasn't checked", () => {
    render(<LayersPanel {...panelProps} checksCount={null} />);
    expect(screen.getByRole("switch", { name: /Checked by eye/ })).toBeDisabled();
    expect(screen.getByText("Only Ahmedabad was checked")).toBeInTheDocument();
  });

  it("turns the satellite picture off", async () => {
    const setLayers = vi.fn();
    render(<LayersPanel {...panelProps} setLayers={setLayers} />);
    await userEvent.click(screen.getByRole("switch", { name: "Satellite picture" }));
    expect(setLayers).toHaveBeenCalledWith({ ...layers, sat: false });
  });
});

describe("Inspector", () => {
  const city = {
    id: "ahmedabad", base: "/data/ahmedabad/",
    summary: { grid_cols: 2, grid_rows: 1, tile: "43QBF", files: { rgb: { 2018: "rgb_2018.webp", 2026: "rgb_2026.webp" } } } as unknown as Summary,
    patches: parsePatches(CSV, YEARS),
  } as City;
  const props = { city, years: YEARS, colour: {}, hidden: false, modelName: "EfficientNet-B0", onClose: vi.fn(), onZoom: vi.fn(), onCopy: vi.fn() };

  it("asks to pick a square when none is chosen", () => {
    render(<Inspector {...props} sel={null} />);
    expect(screen.getByText("Pick a square")).toBeInTheDocument();
  });

  it("shows both years with plain and original names, and the hand-check verdict", () => {
    render(<Inspector {...props} sel={1} verdict="no" />);
    expect(screen.getByText("Reported change")).toBeInTheDocument();
    expect(screen.getByText("Farmland")).toBeInTheDocument();
    expect(screen.getByText("AnnualCrop")).toBeInTheDocument();
    expect(screen.getByText("93% sure")).toBeInTheDocument();
    expect(screen.getByText("not a real change")).toBeInTheDocument();
  });
});
