// Button: a <button>, or a link (<a>) when it has an href. Four looks, two sizes, optional arrow that nudges on hover.
import type { ReactNode } from "react";
import "./Button.css";

type Props = {
  children: ReactNode;
  variant?: "primary" | "accent" | "quiet" | "ghost";
  size?: "md" | "sm";
  href?: string;
  arrow?: "right" | "down";
  onClick?: () => void;
  disabled?: boolean;
};

export function Button({ children, variant = "primary", size = "md", href, arrow, onClick, disabled }: Props) {
  const cls = `btn btn-${variant}${size === "sm" ? " btn-sm" : ""}`;
  const icon = arrow && (
    <svg className="btn-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={arrow === "down" ? "M8 3v10M4 9l4 4 4-4" : "M3 8h10M9 4l4 4-4 4"} />
    </svg>
  );
  if (href) return <a className={cls} href={href} data-arrow={arrow}>{children}{icon}</a>;
  return <button className={cls} type="button" onClick={onClick} disabled={disabled} data-arrow={arrow}>{children}{icon}</button>;
}
