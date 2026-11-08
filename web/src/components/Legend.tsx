// Legend: one row per land-use class. Each row is also a small bar chart (a faint bar of the class colour, sized to
// the biggest class) and a filter button. Shows the plain name; the original EuroSAT name is in the row's tooltip.
import type { CSSProperties } from "react";
import { className } from "../lib/classes";
import "./Legend.css";

export type LegendItem = { key: string; colour: string; value: number; delta?: number };

type Props = {
  items: LegendItem[];
  format: (v: number) => string;
  active?: string[] | null; // classes shown; null = all
  onToggle?: (key: string) => void;
  onPreview?: (key: string | null) => void; // pointing at a row (null when the pointer leaves)
};

export function Legend({ items, format, active = null, onToggle, onPreview }: Props) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return (
    <div className="legend" data-filtered={!!active || undefined} onPointerLeave={() => onPreview?.(null)}>
      {items.map((it) => {
        const name = className(it.key);
        const on = !active || active.includes(it.key);
        const d = it.delta;
        return (
          <button key={it.key} type="button" className="leg" aria-pressed={on}
            style={{ "--c": it.colour, "--w": it.value / max } as CSSProperties}
            title={name.original ? `Model class: ${name.original}` : undefined}
            onClick={() => onToggle?.(it.key)} onPointerEnter={() => onPreview?.(it.key)}
            onFocus={() => onPreview?.(it.key)}>
            <i aria-hidden="true" />
            <span className="leg-name">{name.plain}</span>
            <span className="leg-v">{format(it.value)}{d !== undefined && <em>{d > 0.5 ? "+" : d < -0.5 ? "−" : "±"}{format(Math.abs(d))}</em>}</span>
          </button>
        );
      })}
    </div>
  );
}
