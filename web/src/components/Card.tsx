// Card: a rounded surface. `interactive` adds a soft light that follows the mouse and a small tilt;
// `reveal` makes it rise in the first time it is on screen.
import type { ReactNode } from "react";
import { useReveal, useSpotlight } from "../lib/motion";
import "./Card.css";

type Props = { children: ReactNode; interactive?: boolean; reveal?: boolean; className?: string };

export function Card({ children, interactive = false, reveal = false, className = "" }: Props) {
  const spot = useSpotlight<HTMLDivElement>(interactive ? 4 : 0);
  const rise = useReveal<HTMLDivElement>();
  return (
    <div className={`card${interactive ? " card-interactive" : ""} ${className}`.trim()} ref={interactive ? spot : undefined}>
      <div className="card-in" {...(reveal ? rise : {})}>{children}</div>
    </div>
  );
}
