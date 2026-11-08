// The footer under the Story: what the project is, links, and credits for the data.
import { DATASET, MODEL } from "../story/HowItWorks";
import { Logo, REPO } from "./SiteHeader";
import "./SiteFooter.css";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot-grid">
        <div>
          <a className="brand" href="/"><Logo /><span>TerraScan</span></a>
          <p>A land-use model for satellite images, tested honestly on Indian cities.</p>
        </div>
        <div><h2>Explore</h2><ul><li><a href="/">Story</a></li><li><a href="/explorer">Explorer</a></li><li><a href="/about">About</a></li><li><a href="#how">How it works</a></li></ul></div>
        <div><h2>Project</h2><ul><li><a href={REPO} rel="noopener">Source code</a></li><li><a href={DATASET} rel="noopener">Indian dataset</a></li><li><a href={MODEL} rel="noopener">Model card</a></li></ul></div>
        <div><h2>Credits</h2><ul>
          <li>City images: modified Copernicus Sentinel-2 data</li>
          <li>Globe: NASA Blue Marble, via NASA GIBS</li>
          <li>Training images: EuroSAT (Helber et al.)</li>
        </ul></div>
      </div>
    </footer>
  );
}
