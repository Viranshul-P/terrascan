// Tests for the API client (step 5.3b part 2B). They use a fake fetch: no network.
import { describe, expect, it, vi } from "vitest";
import { ApiError, boxKm, boxProblem, getHealth, predictBox, type Bbox } from "./api";

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("boxKm / boxProblem", () => {
  // Same numbers as the server's own check in results/api_check.json: the Ahmedabad test box is about 10 x 10 km.
  const small: Bbox = [72.55, 23.02, 72.58, 23.047];
  it("measures a box in km (a degree of longitude shrinks with latitude)", () => {
    const [w, h] = boxKm(small);
    expect(w).toBeCloseTo(0.03 * 111.32 * Math.cos((23.0335 * Math.PI) / 180), 3);
    expect(h).toBeCloseTo(0.027 * 111.32, 3);
  });
  it("accepts a box between one square and the limit", () => {
    expect(boxProblem(small, 10)).toBeNull();
  });
  it("explains a box that is too big, with its size", () => {
    expect(boxProblem([72.4, 22.9, 72.7, 23.2], 10)).toMatch(/at most|most we can map is 10 × 10 km/);
    expect(boxProblem([72.4, 22.9, 72.7, 23.2], 10)).toMatch(/30\.\d × 33\.\d km/);
  });
  it("explains a box that is smaller than one 640 m square", () => {
    expect(boxProblem([72.55, 23.02, 72.553, 23.023], 10)).toMatch(/at least 0.64 × 0.64 km/);
  });
});

describe("getHealth", () => {
  it("returns the server's limits", async () => {
    const h = { status: "ok", years: ["2018", "2026"], max_side_km: 10, timeout_s: 60 };
    await expect(getHealth(undefined, reply(200, h))).resolves.toEqual(h);
  });
  it("says so when the server cannot be reached", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getHealth(undefined, f)).rejects.toMatchObject({ kind: "unreachable" });
  });
});

describe("predictBox", () => {
  const box: Bbox = [72.55, 23.02, 72.58, 23.047];
  it("posts the box and the year", async () => {
    const f = reply(200, { tile: "42QZL" });
    await predictBox(box, "2026", undefined, f);
    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/\/predict$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ bbox: box, year: "2026" });
  });
  it("passes on the server's own explanation (422)", async () => {
    const f = reply(422, { detail: "The box is 20.5 x 22.3 km. Please draw at most 10 x 10 km." });
    await expect(predictBox(box, "2026", undefined, f)).rejects.toThrow("Please draw at most 10 x 10 km");
  });
  it("marks a timeout (504)", async () => {
    const f = reply(504, { detail: "Mapping took longer than 60 seconds." });
    const err = await predictBox(box, "2026", undefined, f).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("timeout");
  });
  it("gives a plain message when the answer has no explanation", async () => {
    const f = vi.fn().mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(predictBox(box, "2026", undefined, f)).rejects.toThrow("answered with an error (500)");
  });
});
