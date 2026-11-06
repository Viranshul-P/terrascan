// Stat: one big number with a label and its source marker. It counts up the first time it is on screen.
// The final number sits invisibly under the counting one, so the box never changes size while counting (that keeps
// each frame cheap: only this small box is redrawn; see the step 5.3a speed notes).
import { useCountUp, useSeen } from "../lib/motion";
import { SourceMarker, type Source } from "./SourceMarker";
import "./Stat.css";

type Props = {
  value: number;
  label: string;
  source: Source;
  unit?: string;
  format?: (v: number) => string;
  from?: number;
  tone?: "default" | "accent";
  size?: "lg" | "md";
};

const whole = (v: number) => Math.round(v).toLocaleString("en-US");

export function Stat({ value, label, source, unit, format = whole, from = 0, tone = "default", size = "lg" }: Props) {
  const { ref, seen } = useSeen<HTMLDivElement>();
  const shown = useCountUp(value, { from, start: seen });
  return (
    <div className={`stat stat-${size} stat-${tone}`} ref={ref}>
      <div className="stat-v">
        <span className="stat-num">
          <span className="stat-ghost" aria-hidden="true">{format(value)}</span>
          <span className="stat-live" aria-hidden="true">{format(shown)}</span>
          <span className="sr-only">{format(value)}</span>
        </span>
        {unit && <small>{unit}</small>}
        <SourceMarker {...source} />
      </div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
