// The About page: what TerraScan is, in plain words, and where to find the code, the data and the model. It has no
// numbers of its own (every number on the site comes from a data file and lives on the Story page).
import { useEffect } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { REPO, SiteHeader } from "../components/SiteHeader";
import { DATASET, MODEL } from "../story/HowItWorks";
import "../story/Sections.css";
import "./About.css";

const LINKS = [
  { href: REPO, title: "Source code", where: "GitHub" },
  { href: DATASET, title: "Indian dataset", where: "Hugging Face" },
  { href: MODEL, title: "Model card", where: "Hugging Face" },
];

export function About() {
  useEffect(() => { document.title = "About · TerraScan"; }, []);
  return (
    <>
      <SiteHeader page="about" />
      <main className="about">
        <div className="wrap">
          <span className="eyebrow">About</span>
          <h1>A land-use model, tested honestly on Indian cities.</h1>
          <p className="lead">TerraScan reads free satellite pictures, gives every 640&nbsp;m square of land a name, and then shows how often it was wrong.</p>

          <div className="about-grid">
            <section aria-labelledby="a-question">
              <h2 id="a-question">The question</h2>
              <p>How much of Ahmedabad really changed between the winter of 2018 and the winter of 2026? A model can name every square in both years and flag the squares whose name changed. But some of those flags are the model changing its mind, not the land changing.</p>
              <p>So the flagged squares were checked: a random sample was compared by eye, before and after, and the Story shows how many held up.</p>
            </section>
            <section aria-labelledby="a-model">
              <h2 id="a-model">The model</h2>
              <p>An EfficientNet-B0 image classifier. It first learned from EuroSAT, a set of European Sentinel-2 pictures in ten land-use classes. On Indian land it did much worse, so it was fine-tuned on a small set of labelled patches from Gujarat.</p>
              <p>The scores before and after, with their spread over three training runs, are on the model card.</p>
            </section>
            <section aria-labelledby="a-data">
              <h2 id="a-data">The data</h2>
              <p>Sentinel-2 satellite pictures at 10&nbsp;m per pixel, read from Microsoft Planetary Computer. For each year, the clear December to February days are merged into one cloud-free picture, and the picture is cut into 640&nbsp;m squares.</p>
              <p>The labelled Indian patches are published as an open dataset.</p>
            </section>
            <section aria-labelledby="a-trust">
              <h2 id="a-trust">What to trust</h2>
              <p>It was only tested in Gujarat, on winter pictures, with a small test set. Maps of other places are untested. A square is one guess about the main land use in 640&nbsp;m, not a survey.</p>
              <p>Numbers on the Story page carry a small <b>i</b> that names the file the number came from.</p>
            </section>
          </div>

          <ul className="about-links" aria-label="Project links">
            {LINKS.map((l) => (
              <li key={l.title}><a href={l.href} rel="noopener"><b>{l.title}</b><span>{l.where}</span></a></li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
