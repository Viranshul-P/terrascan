// The small "i" next to every number: opens a note saying which file and key the number came from.
import { useEffect, useId, useRef, useState } from "react";
import "./SourceMarker.css";

// field = the key inside the file, e.g. "final.real_rate". (Not called "key": React keeps that name for itself.)
export type Source = { file: string; field: string; note?: string };

export function SourceMarker({ file, field, note }: Source) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();
  // Close on Escape or on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="src" ref={box}>
      <button type="button" className="src-btn" aria-label="Source" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>i</button>
      <span className="src-pop" id={id} role="dialog" aria-label="Source" data-open={open} hidden={!open}>
        <span className="label">Source</span>
        <code>{file}</code>
        <span className="src-key">{field}{note && <><br /><span className="src-note">{note}</span></>}</span>
      </span>
    </span>
  );
}
