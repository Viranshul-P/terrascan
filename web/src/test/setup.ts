// Test setup. jsdom (the fake browser tests run in) has no matchMedia or IntersectionObserver, so we add simple
// stand-ins: reduced motion is ON by default (so numbers show their final value at once), and every observed
// element counts as on screen.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

export const media = { reduce: true };

window.matchMedia = ((query: string) => ({
  matches: query.includes("reduce") ? media.reduce : false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
window.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
