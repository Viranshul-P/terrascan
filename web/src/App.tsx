// Pages by address. Plain links between pages (no router library): the site has only a few pages.
//   /          the Story (step 5.3c)      /explorer  the map (step 5.3b)      /about  what the project is
import { About } from "./pages/About";
import { Explorer } from "./pages/Explorer";
import { Story } from "./pages/Story";

export function App() {
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/about") return <About />;
  if (path === "/explorer") return <Explorer />;
  return <Story />;
}
