// The phone bottom sheet has three heights ("snaps"). These small functions decide which height is next and which
// one a dragged sheet should settle on. Sizes are in CSS pixels. The matching CSS is in explorer/Explorer.css.
export type Snap = "peek" | "half" | "full";

export const SNAPS: Snap[] = ["peek", "half", "full"];
export const PEEK_PX = 76; // grabber + title row, the only part visible when the sheet is down
const FRACTION: Record<Snap, number> = { peek: 0, half: 0.46, full: 0.84 }; // of the map area's height

// Height of the sheet in a map area that is `area` px tall.
export function snapPx(snap: Snap, area: number): number {
  return snap === "peek" ? PEEK_PX : Math.round(area * FRACTION[snap]);
}

// Tap on the grabber: peek -> half -> full -> back down to peek.
export function nextSnap(snap: Snap): Snap {
  return SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length];
}

// Arrow keys on the grabber: up = taller, down = shorter (stops at the ends).
export function stepSnap(snap: Snap, dir: 1 | -1): Snap {
  return SNAPS[Math.min(SNAPS.length - 1, Math.max(0, SNAPS.indexOf(snap) + dir))];
}

// After a drag: the snap whose height is closest to where the finger let go.
export function nearestSnap(height: number, area: number): Snap {
  return SNAPS.reduce((best, s) => (Math.abs(snapPx(s, area) - height) < Math.abs(snapPx(best, area) - height) ? s : best));
}
