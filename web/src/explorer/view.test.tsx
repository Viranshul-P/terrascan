// Tests for the compass and the 2D / 3D button (ViewControls). The real map needs WebGL, so a small fake map stands
// in: it remembers its bearing and pitch, its listeners, and the last easeTo it was asked for.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { needleTransform, TILT_3D, ViewControls, type ViewMap } from "./ViewControls";

function fakeMap(bearing = 0, pitch = 0) {
  const fns: Record<string, (() => void)[]> = {};
  const m = {
    bearing, pitch, last: null as null | { bearing?: number; pitch?: number },
    getBearing: () => m.bearing,
    getPitch: () => m.pitch,
    on: (t: string, fn: () => void) => { (fns[t] ??= []).push(fn); },
    off: (t: string, fn: () => void) => { fns[t] = (fns[t] ?? []).filter((f) => f !== fn); },
    easeTo: (o: { bearing?: number; pitch?: number }) => { m.last = o; },
    // Moves the fake map the way a drag would, firing the same events as MapLibre.
    move: (b: number, p: number) => { m.bearing = b; m.pitch = p; act(() => { for (const t of ["rotate", "pitch", "pitchend"]) for (const f of fns[t] ?? []) f(); }); },
    listeners: () => Object.values(fns).flat().length,
  };
  return m;
}

describe("needleTransform", () => {
  it("turns against the map (so the needle keeps pointing north) and leans back by the tilt", () => {
    expect(needleTransform(30, 0)).toBe("rotateX(0deg) rotateZ(-30deg)");
    expect(needleTransform(-14.4, 50)).toBe("rotateX(30deg) rotateZ(14deg)"); // leans back 60% of the tilt
  });
});

describe("ViewControls", () => {
  it("is switched off until the map is ready", () => {
    render(<ViewControls map={null} disabled={false} />);
    expect(screen.getByRole("button", { name: "Point north" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3D" })).toBeDisabled();
  });

  it("the compass follows the map and points north again when clicked", async () => {
    const m = fakeMap(0, 0);
    render(<ViewControls map={m as unknown as ViewMap} disabled={false} />);
    const needle = screen.getByRole("button", { name: "Point north" }).querySelector("svg")!;
    m.move(40, 20);
    expect(needle.style.transform).toBe("rotateX(12deg) rotateZ(-40deg)");
    await userEvent.click(screen.getByRole("button", { name: "Point north" }));
    expect(m.last).toMatchObject({ bearing: 0 });
  });

  it("3D tilts a flat map, and shows when the map is tilted (also by dragging)", async () => {
    const m = fakeMap(0, 0), said: boolean[] = [];
    render(<ViewControls map={m as unknown as ViewMap} disabled={false} onTilt={(on) => said.push(on)} />);
    const b = screen.getByRole("button", { name: "3D" });
    expect(b).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(b);
    expect(m.last).toMatchObject({ pitch: TILT_3D });
    m.move(0, 45); // the map finished tilting
    expect(b).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(b);
    expect(m.last).toMatchObject({ pitch: 0 });
    expect(said).toEqual([true, false]);
  });

  it("can't tilt while an area is being drawn", () => {
    render(<ViewControls map={fakeMap() as unknown as ViewMap} disabled={true} />);
    expect(screen.getByRole("button", { name: "3D" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Point north" })).toBeEnabled();
  });

  it("stops listening to the map when it goes away", () => {
    const m = fakeMap();
    const { unmount } = render(<ViewControls map={m as unknown as ViewMap} disabled={false} />);
    expect(m.listeners()).toBe(3);
    unmount();
    expect(m.listeners()).toBe(0);
  });
});
