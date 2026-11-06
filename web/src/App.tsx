// Pages by address. Plain links between pages (no router library): the site has only a few pages.
//   /explorer  the map (step 5.3b)       /design  the design system (step 5.3a)
//   /          for now the Explorer; the Story page takes over "/" in step 5.3c
import { DesignSystem } from "./pages/DesignSystem";
import { Explorer } from "./pages/Explorer";

export function App() {
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/design") return <DesignSystem />;
  return <Explorer />;
}
