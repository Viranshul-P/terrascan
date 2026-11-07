// Drawing the box for "Map your own area": a see-through layer over the map. Press, drag, let go: the rectangle's two
// corners are turned into longitude/latitude with the map's own unproject. (A box only stays a true lon/lat box
// when the map is flat and facing north; the Explorer flattens the map before drawing.)
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { boxKm, type Bbox } from "../lib/api";

export type Projector = { unproject: (p: [number, number]) => { lng: number; lat: number } };
type Point = { x: number; y: number };

const MIN_PX = 14; // a smaller drag counts as a tap, not a box

// The box between two screen points, as [west, south, east, north].
export function boxFromPixels(map: Projector, a: Point, b: Point): Bbox {
  const sw = map.unproject([Math.min(a.x, b.x), Math.max(a.y, b.y)]);
  const ne = map.unproject([Math.max(a.x, b.x), Math.min(a.y, b.y)]);
  return [sw.lng, sw.lat, ne.lng, ne.lat];
}

type Props = {
  map: () => Projector | null;
  maxKm: number; // the server's limit, to warn while drawing
  onBox: (b: Bbox) => void;
  onCancel: () => void;
};

export function DrawLayer({ map, maxKm, onBox, onCancel }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  const at = (e: PointerEvent): Point => {
    const r = el.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); setDrag({ a: p, b: p }); };
  const move = (e: PointerEvent) => { if (drag) setDrag({ a: drag.a, b: at(e) }); };
  const up = (e: PointerEvent) => {
    if (!drag) return;
    const b = at(e);
    setDrag(null);
    const m = map();
    if (m && Math.abs(b.x - drag.a.x) >= MIN_PX && Math.abs(b.y - drag.a.y) >= MIN_PX) onBox(boxFromPixels(m, drag.a, b));
  };

  // Size of the box while dragging, in km (turns "over" past the limit).
  let size: [number, number] | null = null;
  if (drag) { const m = map(); if (m) size = boxKm(boxFromPixels(m, drag.a, drag.b)); }
  const over = !!size && (size[0] > maxKm || size[1] > maxKm);

  return (
    <div className="draw" ref={el} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
      role="application" aria-label="Drawing area: drag to draw a box on the map. Press Escape to cancel.">
      {!drag && <p className="draw-hint">Drag on the map to draw a box</p>}
      {drag && (
        <div className="draw-rect" data-over={over}
          style={{ left: Math.min(drag.a.x, drag.b.x), top: Math.min(drag.a.y, drag.b.y), width: Math.abs(drag.b.x - drag.a.x), height: Math.abs(drag.b.y - drag.a.y) }}>
          {size && <span>{size[0].toFixed(1)} × {size[1].toFixed(1)} km{over ? ` · max ${maxKm}` : ""}</span>}
        </div>
      )}
    </div>
  );
}
