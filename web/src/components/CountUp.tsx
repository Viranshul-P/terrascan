// A number that counts up (or down) to its value once `start` is true. Like Stat: the final number sits invisibly
// underneath, so the text never changes width while counting (no layout shift). Screen readers get the final number.
import { useCountUp } from "../lib/motion";
import "./CountUp.css";

type Props = { to: number; from?: number; start: boolean; format?: (v: number) => string; ms?: number; delay?: number };

const whole = (v: number) => Math.round(v).toLocaleString("en-US");

export function CountUp({ to, from = 0, start, format = whole, ms, delay }: Props) {
  const shown = useCountUp(to, { from, start, ms, delay });
  return (
    <span className="count">
      <span className="count-ghost" aria-hidden="true">{format(Math.max(to, from))}</span>
      <span className="count-live" aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(to)}</span>
    </span>
  );
}
