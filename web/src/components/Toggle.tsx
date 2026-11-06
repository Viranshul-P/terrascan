// Two kinds of toggle: Switch (on / off) and Segmented (pick one of a few, with a pill that slides to the choice).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./Toggle.css";

type SwitchProps = { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean };

export function Switch({ label, hint, checked, onChange, disabled }: SwitchProps) {
  return (
    <label className="switch-row" data-disabled={disabled || undefined}>
      <span className="switch-text">{label}{hint && <small>{hint}</small>}</span>
      <button type="button" role="switch" className="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} />
    </label>
  );
}

type Option<T extends string> = { value: T; label: ReactNode };
type SegmentedProps<T extends string> = { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void };

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  // Move the pill under the chosen button (measured after layout, so it fits any label width).
  useLayoutEffect(() => {
    const btn = group.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (btn) setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [value, options.length]);
  return (
    <div className="seg" role="group" aria-label={label} ref={group}>
      {pill && <span className="seg-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden="true" />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
