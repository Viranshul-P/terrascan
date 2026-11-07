// The compass and the 2D / 3D button in the zoom bar (like Google Earth).
// - The compass needle turns with the map and leans back when the map is tilted. Click it: north up again.
//   Drag it left or right: the map turns.
// - 3D tilts the map (you look across the city); 2D looks straight down. The button shows which one is on.
// The needle is moved by changing its style directly, so turning the map does not re-draw the whole page.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { reducedMotion } from "../lib/motion";

export const TILT_3D = 55; // degrees; MapLibre allows up to 60
const FLAT_BELOW = 5; // a map tilted less than this counts as 2D
export const DEG_PER_PX = 1.5; // dragging the compass 1 px sideways turns the map this much
const DRAG_FROM_PX = 3; // a smaller move still counts as a click

// Only the parts of the MapLibre map this component uses (a small fake map is enough in the tests).
export type ViewMap = {
  getBearing(): number;
  getPitch(): number;
  on(type: "rotate" | "pitch" | "pitchend", fn: () => void): unknown;
  off(type: "rotate" | "pitch" | "pitchend", fn: () => void): unknown;
  easeTo(o: { bearing?: number; pitch?: number; duration: number; essential: true }): unknown;
  jumpTo(o: { bearing: number }): unknown;
};

// The needle's CSS: lean back with the tilt, then turn against the map's rotation (so it keeps pointing north).
// It leans back only 60% of the tilt: leaning the full 55° flattens it too much to read.
export function needleTransform(bearing: number, pitch: number): string {
  return `rotateX(${Math.round(pitch * 0.6)}deg) rotateZ(${Math.round(-bearing)}deg)`;
}

// onTilt: told when the 3D button turns 3D on (true) or off (false), e.g. to show how to turn the map by hand.
export function ViewControls({ map, disabled, onTilt }: { map: ViewMap | null; disabled: boolean; onTilt?: (on: boolean) => void }) {
  const needle = useRef<SVGSVGElement>(null);
  const [tilted, setTilted] = useState(false);
  // While the compass is pressed: where the pointer started, the map's bearing then, and whether it became a drag.
  const drag = useRef<{ x: number; bearing: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!map) return;
    const turn = () => { if (needle.current) needle.current.style.transform = needleTransform(map.getBearing(), map.getPitch()); };
    const settle = () => setTilted(map.getPitch() >= FLAT_BELOW);
    turn(); settle();
    map.on("rotate", turn); map.on("pitch", turn); map.on("pitchend", settle);
    return () => { map.off("rotate", turn); map.off("pitch", turn); map.off("pitchend", settle); };
  }, [map]);

  const ms = (n: number) => (reducedMotion() ? 0 : n);
  const press = (e: PointerEvent) => {
    if (!map) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, bearing: map.getBearing(), moved: false };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!map || !d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) >= DRAG_FROM_PX) d.moved = true;
    if (d.moved) map.jumpTo({ bearing: d.bearing - dx * DEG_PER_PX }); // drag right: the map turns clockwise
  };
  const click = () => {
    const wasDrag = drag.current?.moved;
    drag.current = null;
    if (!wasDrag) map?.easeTo({ bearing: 0, duration: ms(500), essential: true });
  };
  return <>
    <button type="button" className="compass" aria-label="Point north" title="Compass: drag left or right to turn the map, click to point north" disabled={!map}
      onPointerDown={press} onPointerMove={move} onPointerCancel={() => (drag.current = null)} onClick={click}>
      <svg ref={needle} viewBox="0 0 24 24" aria-hidden="true">
        {/* A needle across the whole ring: the red half points north, the grey half south. */}
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
        <path d="M12 2.5 15.5 12h-7Z" fill="#e5484d" /><path d="M12 21.5 8.5 12h7Z" fill="currentColor" opacity="0.6" />
        <circle cx="12" cy="12" r="1.4" fill="var(--surface, #fff)" />
      </svg>
    </button>
    <button type="button" className="tilt" aria-pressed={tilted} disabled={!map || disabled}
      title={disabled ? "Drawing an area needs a flat map" : tilted ? "3D is on: click for a straight-down view" : "Tilt the map to see it in 3D"}
      onClick={() => { map?.easeTo({ pitch: tilted ? 0 : TILT_3D, duration: ms(700), essential: true }); onTilt?.(!tilted); }}>3D</button>
  </>;
}
