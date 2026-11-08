// The Story page as a whole (step 5.3d): until the visitor first scrolls, touches, presses a key or moves the mouse, it
// shows the still globe and does NOT start the live map (its code is about 430 KB gzipped and kept a slow phone busy
// while the page was settling). The map itself needs WebGL, so a stand-in counts how often it is made.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Story } from "./Story";

const made = vi.hoisted(() => ({ count: 0 }));
vi.mock("../map/TerraMap", () => ({
  TerraMap: class {
    map = { setPadding() {}, on() {}, isMoving: () => false };
    constructor() { made.count += 1; }
    remove() {}
  },
  maplibregl: { Marker: class { setLngLat() { return this; } } },
}));

// The site's real data files, served from memory instead of the network.
const files = import.meta.glob("../../public/data/**/*.{json,csv}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
vi.stubGlobal("fetch", async (url: string) => {
  const text = files[`../../public${url}`];
  return text === undefined ? new Response("", { status: 404 }) : new Response(text);
});

describe("Story page", () => {
  it("shows the still globe first and starts the live map only after the first interaction", async () => {
    const { container } = render(<Story />);
    await screen.findByRole("heading", { level: 1 });
    expect(container.querySelector(".story-map .poster")).not.toBeNull();
    // Longer than the 1.6 s the page used to wait before starting the map by itself.
    await new Promise((r) => setTimeout(r, 1900));
    expect(made.count).toBe(0);
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(made.count).toBe(1));
  });
});
