// Tests for "Map your own area": the state machine, the panel's states and the drawn box. The mapping engine is a
// fake `run` (no network, no model). The map answer below is TEST DATA made up for these tests; it is never shown on
// the website.
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveResult, Progress } from "../live/engine";
import type { Bbox } from "../live/pipeline";
import { AreaPanel } from "./AreaPanel";
import { boxFromPixels } from "./DrawLayer";
import { useAreaMap, type Run } from "./useAreaMap";

vi.mock("../live/client", () => ({ liveConfig: async () => ({ max_side_km: 6, parity: null }), runLive: async () => { throw new Error("not in tests"); } }));

const YEARS = ["2018", "2026"];
const CLASSES = [{ name: "Residential", colour: "#d33" }, { name: "AnnualCrop", colour: "#ec4" }, { name: "River", colour: "#38b" }];
const BOX: Bbox = [72.55, 23.02, 72.58, 23.047]; // about 3.1 x 3.0 km
const info = { window: "w", n_scenes: 5, first_date: "2025-12-02", last_date: "2026-02-20", scenes: [], offset_fixed: 5 };
const RESULT = {
  bbox: BOX, tile: "TEST", epsg: 32643, years: YEARS, info: { "2018": info, "2026": info },
  overlay_corners: [], km2_per_patch: 0.4096, n_patches: 25, n_patches_touching_finetune_area: 3,
  areas_km2: { "2018": { Residential: 4.5, AnnualCrop: 5.5, River: 0 }, "2026": { Residential: 6.5, AnnualCrop: 3.5, River: 0 } },
  mean_confidence: { "2018": 0.7, "2026": 0.8 },
  changes: [{ from: "AnnualCrop", to: "Residential", patches: 5, km2: 2.048 }], n_changed: 5,
  patches_geojson: { type: "FeatureCollection", features: [] },
  rgb: { "2018": "blob:a", "2026": "blob:b" }, geotiff: { "2018": "blob:c", "2026": "blob:d" },
  backend: "wasm", timings_ms: { search: 1000, pictures: 8000, model: 500, total: 9500 }, bytes_read: 3e6,
} as unknown as LiveResult;

const fine = (): Run => vi.fn(async (_b: Bbox, ys: string[]) => ({ ...RESULT, years: ys }));
const never = (): Run => vi.fn((_b, _y, onProgress: (p: Progress) => void) => { onProgress({ stage: "pictures", done: 3, total: 10 }); return new Promise<LiveResult>(() => {}); });

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("useAreaMap", () => {
  it("goes draw -> ready -> running -> done, both years by default", async () => {
    const run = fine();
    const { result } = renderHook(() => useAreaMap(YEARS, run));
    expect(result.current.mode).toBe("off");
    act(() => result.current.open());
    expect(result.current.mode).toBe("draw");
    act(() => result.current.setBox(BOX));
    expect(result.current.mode).toBe("ready");
    await act(async () => { await result.current.run(); });
    expect(vi.mocked(run).mock.calls[0][1]).toEqual(YEARS);
    expect(result.current.mode).toBe("done");
    expect(result.current.shown).toBe("2026");
  });

  it("maps one year when asked", async () => {
    const run = fine();
    const { result } = renderHook(() => useAreaMap(YEARS, run));
    act(() => { result.current.open(); result.current.setBox(BOX); });
    await act(async () => { await result.current.run("2018"); });
    expect(vi.mocked(run).mock.calls[0][1]).toEqual(["2018"]);
    expect(result.current.shown).toBe("2018");
  });

  it("shows the engine's own words when it refuses the box", async () => {
    const run: Run = async () => { throw new Error("The pictures have gaps everywhere in this box."); };
    const { result } = renderHook(() => useAreaMap(YEARS, run));
    act(() => { result.current.open(); result.current.setBox(BOX); });
    await act(async () => { await result.current.run(); });
    expect(result.current.mode).toBe("error");
    expect(result.current.error).toBe("The pictures have gaps everywhere in this box.");
  });

  it("does not run a box that is too big", async () => {
    const run = fine();
    const { result } = renderHook(() => useAreaMap(YEARS, run));
    act(() => { result.current.open(); result.current.setBox([72.4, 22.9, 72.7, 23.2]); });
    await act(async () => { await result.current.run(); });
    expect(result.current.mode).toBe("ready");
    expect(run).not.toHaveBeenCalled();
  });

  it("counts seconds while mapping, and Cancel stops it", async () => {
    const { result } = renderHook(() => useAreaMap(YEARS, never()));
    act(() => { result.current.open(); result.current.setBox(BOX); });
    act(() => { void result.current.run(); });
    expect(result.current.mode).toBe("running");
    act(() => { vi.advanceTimersByTime(4100); });
    expect(result.current.elapsed).toBeGreaterThanOrEqual(4);
    act(() => result.current.cancel());
    expect(result.current.mode).toBe("ready");
  });

  it("closing clears the box and the result", async () => {
    const { result } = renderHook(() => useAreaMap(YEARS, fine()));
    act(() => { result.current.open(); result.current.setBox(BOX); });
    await act(async () => { await result.current.run(); });
    act(() => result.current.close());
    expect(result.current.mode).toBe("off");
    expect(result.current.bbox).toBeNull();
    expect(result.current.result).toBeNull();
  });
});

describe("AreaPanel", () => {
  // Renders the panel around a real hook, so the buttons really change the state.
  function Harness({ run, start }: { run: Run; start: (a: ReturnType<typeof useAreaMap>) => void }) {
    const area = useAreaMap(YEARS, run);
    return (
      <>
        <button onClick={() => start(area)}>start</button>
        <AreaPanel area={area} years={YEARS} classes={CLASSES} picked={null} hidden={false} snap="half" onSnap={() => {}} onMiddle={() => {}} changesOnly={false} onChangesOnly={() => {}} />
      </>
    );
  }
  const go = async (run: Run, start: (a: ReturnType<typeof useAreaMap>) => void) => {
    render(<Harness run={run} start={start} />);
    await userEvent.click(screen.getByText("start"), { advanceTimers: vi.advanceTimersByTime });
  };

  it("asks for a box first, says it runs in the browser, and shows the limits", async () => {
    await go(fine(), (a) => a.open());
    expect(screen.getByText(/at most 6 × 6 km/)).toBeInTheDocument();
    expect(screen.getByText(/No server, no sign-in/)).toBeInTheDocument();
    expect(screen.getByText(/Accuracy was only measured in Gujarat/)).toBeInTheDocument();
  });

  it("explains a box that is too big and will not run it", async () => {
    await go(fine(), (a) => { a.open(); a.setBox([72.4, 22.9, 72.7, 23.2]); });
    expect(screen.getByRole("alert")).toHaveTextContent(/zoom in or draw a smaller box/);
    expect(screen.getByRole("button", { name: "Map this box" })).toBeDisabled();
  });

  it("shows the steps and their progress while mapping", async () => {
    await go(never(), (a) => { a.open(); a.setBox(BOX); });
    await userEvent.click(screen.getByRole("button", { name: "Map this box" }), { advanceTimers: vi.advanceTimersByTime });
    expect(screen.getByText("Read the pictures (3 of 10)").closest("li")).toHaveAttribute("data-state", "now");
    expect(screen.getByText("Find clear Sentinel-2 pictures").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows the change and the land use (zero classes left out), and the downloads", async () => {
    await go(fine(), (a) => { a.open(); a.setBox(BOX); });
    await userEvent.click(screen.getByRole("button", { name: "Map this box" }), { advanceTimers: vi.advanceTimersByTime });
    await screen.findByText("6.50");
    expect(screen.getByText(/of 25 squares changed class from 2018 to 2026/)).toBeInTheDocument();
    expect(screen.getByText("2.05 km²")).toBeInTheDocument();
    expect(screen.getAllByText("Housing").length).toBeGreaterThan(0);
    expect(screen.queryByText("River")).not.toBeInTheDocument();
    expect(screen.getByText(/3 of these squares touch an area used to fine-tune/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GeoTIFF (2026)" })).toHaveAttribute("download", "terrascan-TEST-2026.tif");
  });

  it("shows why it failed, with a way to try again", async () => {
    const run: Run = async () => { throw new Error("No clear Sentinel-2 picture covers this whole box."); };
    await go(run, (a) => { a.open(); a.setBox(BOX); });
    await userEvent.click(screen.getByRole("button", { name: "Map this box" }), { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText("No clear Sentinel-2 picture covers this whole box.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});

describe("boxFromPixels", () => {
  // A fake map where 1 pixel = 0.001 degrees, with the top left at lon 72, lat 24.
  const map = { unproject: ([x, y]: [number, number]) => ({ lng: 72 + x / 1000, lat: 24 - y / 1000 }) };
  it("turns two dragged corners into west, south, east, north (any drag direction)", () => {
    const expected = [72.1, 23.7, 72.3, 23.9];
    expect(boxFromPixels(map, { x: 100, y: 100 }, { x: 300, y: 300 })).toEqual(expected);
    expect(boxFromPixels(map, { x: 300, y: 300 }, { x: 100, y: 100 })).toEqual(expected);
    expect(boxFromPixels(map, { x: 300, y: 100 }, { x: 100, y: 300 })).toEqual(expected);
  });
});


