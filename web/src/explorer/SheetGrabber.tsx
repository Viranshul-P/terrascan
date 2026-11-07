// The handle at the top of a phone bottom sheet. Drag it up or down, tap it to step through the three heights, or use
// the arrow keys. (Hidden on desktop, where the panels float at the sides.)
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { nearestSnap, nextSnap, PEEK_PX, stepSnap, type Snap } from "../lib/sheet";

type Props = { snap: Snap; onSnap: (s: Snap) => void; label: string };

export function SheetGrabber({ snap, onSnap, label }: Props) {
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false); // the click that ends a drag is not a tap

  const sheet = (el: HTMLElement) => el.closest<HTMLElement>(".panel")!;
  const area = (el: HTMLElement) => sheet(el).parentElement!.clientHeight;

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    ignoreClick.current = false;
    drag.current = { y: e.clientY, h: sheet(e.currentTarget).offsetHeight, moved: false };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    const el = sheet(e.currentTarget);
    el.dataset.dragging = "true"; // switches the height transition off while the finger is down
    el.style.height = `${Math.min(area(e.currentTarget) * 0.9, Math.max(PEEK_PX, d.h + dy))}px`;
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    ignoreClick.current = true;
    const el = sheet(e.currentTarget);
    const next = nearestSnap(el.offsetHeight, area(e.currentTarget));
    delete el.dataset.dragging;
    el.style.height = ""; // back to the height the CSS gives this snap
    onSnap(next);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onSnap(stepSnap(snap, e.key === "ArrowUp" ? 1 : -1));
    }
  };

  return (
    <button type="button" className="grabber" aria-label={`${label}: ${snap === "peek" ? "open" : "resize"}`} aria-expanded={snap !== "peek"}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
      onClick={() => { if (ignoreClick.current) ignoreClick.current = false; else onSnap(nextSnap(snap)); }}>
      <span aria-hidden="true" />
    </button>
  );
}
