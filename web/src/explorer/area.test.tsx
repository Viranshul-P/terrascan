// Tests for "Map your own area" (step 5.3b part 2B): the state machine, the panel's states and the drawn box.
// The server is a fake fetch (no network). The map answer below is TEST DATA made up for these tests; it is never
// shown on the website.
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bbox, LiveMap } from "../lib/api";
import { AreaPanel } from "./AreaPanel";
import { boxFromPixels } from "./DrawLayer";
import { useAreaMap, WAKING_AFTER_MS } from "./useAreaMap";

const YEARS = ["2018", "2026"];
const CLASSES = [{ name: "Residential", colour: "#d33" }, { name: "AnnualCrop", colour: "#ec4" }, { name: "River", colour: "#38b" }];
const BOX: Bbox = [72.55, 23.02, 72.58, 23.047]; // about 3.1 x 3.0 km
const HEALTH = { status: "ok", years: YEARS, max_side_km: 10, timeout_s: 60 };
const MAP = {
  bbox: BOX, tile: "TEST", scene_note: "median of the 5 clearest scenes at most", overlay_corners: [], km2_per_patch: 0.4096, n_patches: 25,
  n_patches_touching_finetune_area: 3,
  years: { "2026": { window: "w", n_scenes: 5, first_date: "2025-12-02", last_date: "2026-02-20" } },
  areas_km2: { "2026": { Residential: 6.5, AnnualCrop: 3.5, River: 0 } }, mean_confidence: { "2026": 0.8 },
  patches_geojson: { type: "FeatureCollection", features: [] },
  files: { overlay: {}, rgb: {}, geotiff: { "2026": "data:image/tiff;base64,AAAA" } },
} as unknown as LiveMap;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
// A fake server: /health and /predict answered by the given functions.
const fakeServer = (health: () => Promise<Response>, predict: () => Promise<Response>) =>
  vi.fn((url: RequestInfo | URL) => (String(url).endsWith("/health") ? health() : predict())) as unknown as typeof fetch;
const fine = () => fakeServer(async () => json(200, HEALTH), async () => json(200, MAP));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("useAreaMap", () => {
  it("goes draw -> ready -> running -> done", async () => {
    const { result } = renderHook(() => useAreaMap(YEARS, fine()));
    expect(result.current.mode).toBe("off");
    act(() => result.current.open());
    expect(result.current.mode).toBe("draw");
    act(() => result.current.setBox(BOX));
    expect(result.current.mode).toBe("ready");
    await waitFor(() => expect(result.current.server).toBe("awake"));
    expect(result.current.limits.max_side_km).toBe(10);
    await act(async () => { await result.current.run("2026"); });
    expect(result.current.mode).toBe("done");
    expect(result.current.result?.year).toBe("2026");
  });

  it("says the server is waking up when /health is slow", async () => {
    let answer: (r: Response) => void = () => {};
    const f = fakeServer(() => new Promise((res) => { answer = res; }), async () => json(200, MAP));
    const { result } = renderHook(() => useAreaMap(YEARS, f));
    act(() => result.current.open());
    expect(result.current.server).toBe("checking");
    act(() => { vi.advanceTimersByTime(WAKING_AFTER_MS + 100); });
    expect(result.current.server).toBe("waking");
    await act(async () => { answer(json(200, HEALTH)); });
    await waitFor(() => expect(result.current.server).toBe("awake"));
  });

  it("says so when the server cannot be reached", async () => {
    const f = fakeServer(() => Promise.reject(new TypeError("Failed to fetch")), () => Promise.reject(new TypeError("Failed to fetch")));
    const { result } = renderHook(() => useAreaMap(YEARS, f));
    act(() => result.current.open());
    await waitFor(() => expect(result.current.server).toBe("off"));
    act(() => result.current.setBox(BOX));
    await act(async () => { await result.current.run("2026"); });
    expect(result.current.mode).toBe("error");
    expect(result.current.error).toMatch(/Could not reach the mapping server/);
  });

  it("shows the server's own words when it refuses the box (422)", async () => {
    const f = fakeServer(async () => json(200, HEALTH), async () => json(422, { detail: "The pictures have gaps everywhere in this box." }));
    const { result } = renderHook(() => useAreaMap(YEARS, f));
    act(() => result.current.open());
    act(() => result.current.setBox(BOX));
    await act(async () => { await result.current.run("2026"); });
    expect(result.current.mode).toBe("error");
    expect(result.current.error).toBe("The pictures have gaps everywhere in this box.");
  });

  it("does not send a box that is too big", async () => {
    const f = fine();
    const { result } = renderHook(() => useAreaMap(YEARS, f));
    act(() => result.current.open());
    act(() => result.current.setBox([72.4, 22.9, 72.7, 23.2]));
    await act(async () => { await result.current.run("2026"); });
    expect(result.current.mode).toBe("ready");
    expect(vi.mocked(f).mock.calls.some(([u]) => String(u).endsWith("/predict"))).toBe(false);
  });

  it("counts seconds while mapping, and Cancel stops waiting", async () => {
    const f = fakeServer(async () => json(200, HEALTH), () => new Promise(() => {})); // never answers
    const { result } = renderHook(() => useAreaMap(YEARS, f));
    act(() => result.current.open());
    act(() => result.current.setBox(BOX));
    act(() => { void result.current.run("2026"); });
    expect(result.current.mode).toBe("running");
    act(() => { vi.advanceTimersByTime(4100); });
    expect(result.current.elapsed).toBeGreaterThanOrEqual(4);
    act(() => result.current.cancel());
    expect(result.current.mode).toBe("ready");
  });

  it("gives up a little after the server's own time limit", async () => {
    const f = fakeServer(async () => json(200, HEALTH), (() => new Promise(() => {})));
    const { result } = renderHook(() => useAreaMap(YEARS, f));
    act(() => result.current.open());
    await waitFor(() => expect(result.current.server).toBe("awake"));
    act(() => result.current.setBox(BOX));
    act(() => { void result.current.run("2026"); });
    await act(async () => { vi.advanceTimersByTime((60 + 15) * 1000 + 100); });
    await waitFor(() => expect(result.current.mode).toBe("error"));
    expect(result.current.error).toMatch(/did not answer within 75 seconds/);
  });

  it("closing clears the box and the result", async () => {
    const { result } = renderHook(() => useAreaMap(YEARS, fine()));
    act(() => result.current.open());
    act(() => result.current.setBox(BOX));
    await act(async () => { await result.current.run("2026"); });
    act(() => result.current.close());
    expect(result.current.mode).toBe("off");
    expect(result.current.bbox).toBeNull();
    expect(result.current.result).toBeNull();
  });
});

describe("AreaPanel", () => {
  // Renders the panel around a real hook, so the buttons really change the state.
  function Harness({ fetchFn, start }: { fetchFn: typeof fetch; start: (a: ReturnType<typeof useAreaMap>) => void }) {
    const area = useAreaMap(YEARS, fetchFn);
    return (
      <>
        <button onClick={() => start(area)}>start</button>
        <AreaPanel area={area} years={YEARS} classes={CLASSES} picked={null} hidden={false} snap="half" onSnap={() => {}} onMiddle={() => {}} />
      </>
    );
  }
  const go = async (fetchFn: typeof fetch, start: (a: ReturnType<typeof useAreaMap>) => void) => {
    render(<Harness fetchFn={fetchFn} start={start} />);
    await userEvent.click(screen.getByText("start"), { advanceTimers: vi.advanceTimersByTime });
  };

  it("asks for a box first, and always shows the limits", async () => {
    await go(fine(), (a) => a.open());
    expect(screen.getByText(/at most 60|at most 10/)).toBeInTheDocument();
    expect(screen.getByText(/Accuracy was only measured in Gujarat/)).toBeInTheDocument();
  });

  it("explains a box that is too big and will not run it", async () => {
    await go(fine(), (a) => { a.open(); a.setBox([72.4, 22.9, 72.7, 23.2]); });
    expect(screen.getByRole("alert")).toHaveTextContent(/zoom in or draw a smaller box/);
    expect(screen.getByRole("button", { name: "Map this box" })).toBeDisabled();
  });

  it("shows the waking-up message and the time limit while mapping", async () => {
    const f = fakeServer(() => new Promise(() => {}), () => new Promise(() => {})); // the server never answers
    await go(f, (a) => { a.open(); a.setBox(BOX); });
    await userEvent.click(screen.getByRole("button", { name: "Map this box" }), { advanceTimers: vi.advanceTimersByTime });
    expect(screen.getAllByRole("status").map((e) => e.textContent).join(" ")).toMatch(/Waking up the server, then mapping/);
    expect(screen.getByText(/gives up after 60 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows the result: km² per class (zero classes left out), confidence, GeoTIFF link", async () => {
    await go(fine(), (a) => { a.open(); a.setBox(BOX); });
    await userEvent.click(screen.getByRole("button", { name: "Map this box" }), { advanceTimers: vi.advanceTimersByTime });
    await screen.findByText("6.50");
    expect(screen.getByText("Housing")).toBeInTheDocument();
    expect(screen.getByText("3.50")).toBeInTheDocument();
    expect(screen.queryByText("River")).not.toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText(/3 of these squares touch an area used to fine-tune/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download GeoTIFF" })).toHaveAttribute("download", "terrascan-box-2026.tif");
  });

  it("shows why it failed, with a way to try again", async () => {
    const f = fakeServer(async () => json(200, HEALTH), async () => json(504, { detail: "Mapping took longer than 60 seconds." }));
    await go(f, (a) => { a.open(); a.setBox(BOX); });
    await userEvent.click(screen.getByRole("button", { name: "Map this box" }), { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText("Mapping took longer than 60 seconds.")).toBeInTheDocument();
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
