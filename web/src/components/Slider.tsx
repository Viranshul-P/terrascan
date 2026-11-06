// Slider: a native range input (so keyboard and screen readers work), styled, with its value shown next to it.
import { useId, type CSSProperties } from "react";
import "./Slider.css";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
};

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, format = String }: Props) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="range" type="range" min={min} max={max} step={step} value={value}
        style={{ "--v": `${fill}%` } as CSSProperties} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{format(value)}</output>
    </div>
  );
}
