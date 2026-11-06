// The bar at the top of every page: logo, page links, GitHub, theme switch.
// (The Story, Method and Limits pages come in step 5.3c; their links are added then.)
import { ThemeToggle } from "./ThemeToggle";
import "./SiteHeader.css";

export const REPO = "https://github.com/Viranshul-P/terrascan";

// Logomark: a 3 x 3 grid of 640 m squares, one of them flagged.
export const Logo = () => (
  <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
    {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => {
      const flag = r === 0 && c === 2;
      return <rect key={`${r}${c}`} x={1 + c * 7} y={1 + r * 7} width="6" height="6" rx="1.5"
        fill={flag ? "var(--accent-fill)" : "currentColor"} opacity={flag ? 1 : 0.22 + (r + c) * 0.13} />;
    }))}
  </svg>
);

export function SiteHeader({ page }: { page: "explorer" | "design" }) {
  return (
    <header className="site-nav">
      <a className="brand" href="/explorer" aria-label="TerraScan home"><Logo /><span>TerraScan</span></a>
      <nav className="site-links" aria-label="Main">
        <a href="/explorer" aria-current={page === "explorer" ? "page" : undefined}>Explorer</a>
        <a href="/design" aria-current={page === "design" ? "page" : undefined}>Design system</a>
      </nav>
      <div className="site-tools">
        <a className="site-gh" href={REPO} rel="noopener">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" /></svg>
          <span>GitHub</span>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
