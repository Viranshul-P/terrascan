// The compass and the 2D / 3D button in the zoom bar (like Google Earth).
// - The compass needle turns with the map and leans back when the map is tilted. Click it: north up again.
// - 3D tilts the map (you look across the city); 2D looks straight down. The button shows which one is on.
// The needle is moved by changing its style directly, so turning the map does not re-draw the whole page.
import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "../lib/motion";

export const TILT_3D = 55; // degrees; MapLibre allows up to 60
const FLAT_BELOW = 5; // a map tilted less than this counts as 2D

// Only the parts of the MapLibre map this component uses (a small fake map is enough in the tests).
export type ViewMap = {
  getBearing(): number;
  getPitch(): number;
  on(type: "rotate" | "pitch" | "pitchend", fn: () => void): unknown;
  off(type: "rotate" | "pitch" | "pitchend", fn: () => void): unknown;
  easeTo(o: { bearing?: number; pitch?: number; duration: number; essential: true }): unknown;
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

  useEffect(() => {
    if (!map) return;
    const turn = () => { if (needle.current) needle.current.style.transform = needleTransform(map.getBearing(), map.getPitch()); };
    const settle = () => setTilted(map.getPitch() >= FLAT_BELOW);
    turn(); settle();
    map.on("rotate", turn); map.on("pitch", turn); map.on("pitchend", settle);
    return () => { map.off("rotate", turn); map.off("pitch", turn); map.off("pitchend", settle); };
  }, [map]);

  const ms = (n: number) => (reducedMotion() ? 0 : n);
  return <>
    <button type="button" className="compass" aria-label="Point north" title="Point north" disabled={!map}
      onClick={() => map?.easeTo({ bearing: 0, duration: ms(500), essential: true })}>
      <svg ref={needle} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" /><path d="M10 2.5 13 10H7Z" fill="var(--accent)" /><path d="M10 17.5 7 10h6Z" fill="currentColor" opacity="0.55" /></svg>
    </button>
    <button type="button" className="tilt" aria-pressed={tilted} disabled={!map || disabled}
      title={disabled ? "Drawing an area needs a flat map" : tilted ? "3D is on: click for a straight-down view" : "Tilt the map to see it in 3D"}
      onClick={() => { map?.easeTo({ pitch: tilted ? 0 : TILT_3D, duration: ms(700), essential: true }); onTilt?.(!tilted); }}>3D</button>
  </>;
}
