// The pure steps of in-browser mapping (pipeline.ts, utm.ts). The whole chain is checked against the Python
// pipeline on real pictures in results/browser_parity.json; these tests pin each piece without the network.
import { describe, expect, it } from "vitest";
import { coversBox, cutPatches, medianComposite, needsOffsetFix, onePerDate, pickScenes, pixelWindow, preprocess, rint, sceneValues, topClass, valuesToRgb, type Item } from "./pipeline";
import { toLonLat, toUtm } from "./utm";

// Reference values from pyproj (Transformer.from_crs(4326, epsg, always_xy=True)).
const PYPROJ: [number, number, number, number, number][] = [
  [32643, 72.55, 23.0, 248866.72808897003, 2545618.589171298],
  [32643, 72.6, 23.05, 254084.80925172474, 2551072.1433172217],
  [32643, 70.7, 22.21, 56507.43807155866, 2462370.108981317],
  [32643, 75.1, 21.9, 510329.3093651705, 2421761.788984997],
  [32642, 68.9, 23.1, 489759.4084746508, 2554593.3108363478],
  [32733, 14.5, -22.6, 448609.03604503255, 7500672.834329905],
];

describe("UTM", () => {
  it.each(PYPROJ)("EPSG:%i %f,%f matches pyproj to a millimetre", (epsg, lon, lat, x, y) => {
    const [ex, ey] = toUtm(epsg, lon, lat);
    expect(Math.abs(ex - x)).toBeLessThan(1e-3);
    expect(Math.abs(ey - y)).toBeLessThan(1e-3);
    const [blon, blat] = toLonLat(epsg, x, y);
    expect(Math.abs(blon - lon)).toBeLessThan(1e-9);
    expect(Math.abs(blat - lat)).toBeLessThan(1e-9);
  });
});

const item = (id: string, date: string, tile: string, cloud: number, gen = "2026-01-01", baseline = "05.11"): Item => ({
  id, geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
  properties: { datetime: `${date}T05:00:00Z`, "eo:cloud_cover": cloud, "s2:mgrs_tile": tile, "s2:processing_baseline": baseline, "s2:generation_time": gen },
  assets: {},
});

describe("scenes", () => {
  it("keeps one scene per date (newest processing), sorted by date", () => {
    const got = onePerDate([item("b", "2026-01-02", "T", 1), item("a-old", "2026-01-01", "T", 1, "2026-01-01"), item("a-new", "2026-01-01", "T", 1, "2026-03-01")]);
    expect(got.map((i) => i.id)).toEqual(["a-new", "b"]);
  });
  it("picks the tile with most dates and its clearest scenes, sorted by date", () => {
    const items = [item("x1", "2026-01-01", "X", 5), item("y1", "2026-01-01", "Y", 1), item("y2", "2026-01-05", "Y", 9), item("y3", "2026-01-09", "Y", 3)];
    const p = pickScenes(items, 2)!;
    expect(p.tile).toBe("Y");
    expect(p.scenes.map((i) => i.id)).toEqual(["y1", "y3"]);
    expect(pickScenes(items, 2, "X")!.scenes.map((i) => i.id)).toEqual(["x1"]);
    expect(pickScenes(items, 2, "Z")).toBeNull();
  });
  it("decides the +1000 offset per scene from the processing baseline", () => {
    expect(needsOffsetFix(item("a", "2026-01-01", "T", 1, "", "04.00"), [4, 0])).toBe(true);
    expect(needsOffsetFix(item("a", "2018-01-01", "T", 1, "", "02.12"), [4, 0])).toBe(false);
    expect(needsOffsetFix(item("a", "2018-01-01", "T", 1, "", "05.12"), [4, 0])).toBe(true);
  });
  it("only accepts footprints that cover the whole box", () => {
    const g = item("a", "2026-01-01", "T", 1).geometry;
    expect(coversBox(g, [1, 1, 2, 2])).toBe(true);
    expect(coversBox(g, [9, 9, 11, 11])).toBe(false);
  });
});

describe("pixels", () => {
  it("rounds halves to even like numpy rint", () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6].map(rint)).toEqual([0, 2, 2, 2, 3]);
  });
  it("rounds windows like rasterio (offsets floor(v + 0.1), lengths floor(v + 0.5))", () => {
    expect(pixelWindow([1009.5, 0, 1205.1, 199.4], [1000, 1000], 10)).toEqual({ col: 1, row: 80, width: 20, height: 20 });
    expect(pixelWindow([1009.0, 0, 1100, 100], [1000, 1000], 10)).toEqual({ col: 1, row: 90, width: 9, height: 10 });
  });
  it("removes the offset per scene and marks zero pixels as missing", () => {
    const { values, has } = sceneValues([[1500, 0], [1200, 5], [900, 5]], true, 1000);
    expect([...values]).toEqual([500, 200, 0, 0, 0, 0]);
    expect([...has]).toEqual([1, 0]);
  });
  it("takes the median over scenes that have data (even count = mean of the middle two)", () => {
    const sc = (v: number[], h: number[]) => ({ values: Int32Array.from(v), has: Uint8Array.from(h) });
    const m = medianComposite([sc([1, 1, 1, 9, 9, 9], [1, 1]), sc([3, 3, 3, 0, 0, 0], [1, 0]), sc([4, 4, 4, 0, 0, 0], [1, 0]), sc([10, 10, 10, 0, 0, 0], [1, 0])]);
    expect([...m.values]).toEqual([3.5, 3.5, 3.5, 9, 9, 9]);
    expect([...m.has]).toEqual([1, 1]);
  });
  it("calibrates and stretches to EuroSAT's 1..255", () => {
    const rgb = valuesToRgb(Float32Array.from([0, 2750, 99999]), { gain: [1, 1, 1], shift: [0, 0, 0] }, 2750);
    expect([...rgb]).toEqual([1, 255, 255]);
  });
  it("cuts only full squares with no missing pixel", () => {
    const has = new Uint8Array(4 * 6).fill(1);
    has[5] = 0; // row 0, col 5: a missing pixel in the top-right square, so that square is dropped
    expect(cutPatches(has, 4, 6, 2)).toEqual([[0, 0], [0, 2], [2, 0], [2, 2], [2, 4]]);
  });
  it("scales up and normalises like torch (a flat patch stays flat)", () => {
    const rgb = new Uint8Array(2 * 2 * 3).fill(255);
    const x = preprocess(rgb, 2, [[0, 0]], 2, { url: "", sha256: "", seed: 42, image_size: 4, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], classes: [] });
    expect(x.length).toBe(3 * 4 * 4);
    expect([...x].every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
  });
  it("turns logits into the top class and its softmax probability", () => {
    const { cls, conf } = topClass(Float32Array.from([0, 0, 2, 1, 1, 1]), 3);
    expect([...cls]).toEqual([2, 0]);
    expect(conf[1]).toBeCloseTo(1 / 3, 6);
    expect(conf[0]).toBeCloseTo(Math.exp(2) / (2 + Math.exp(2)), 6);
  });
});
