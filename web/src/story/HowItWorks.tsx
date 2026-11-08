// "How it works" (step 5.3c): four small drawn steps, then the links. Numbers come from the data files (class count
// from index.json, fine-tuning set and checks from story.json). Links only to things that exist; the model card
// (step 6.1) and the blog post (step 6.4) are shown as "coming".
import type { CSSProperties, ReactNode } from "react";
import { REPO } from "../components/SiteHeader";
import { SourceMarker } from "../components/SourceMarker";
import { useReveal } from "../lib/motion";
import type { StoryData } from "../lib/story";
import type { Index } from "../lib/types";

// The Indian dataset published in step 4.5 (PROGRESS.md log).
export const DATASET = "https://huggingface.co/datasets/viranshul/terrascan-india-gujarat";
// The model published in step 6.1 (PROGRESS.md log).
export const MODEL = "https://huggingface.co/viranshul/terrascan-efficientnet-b0-india";

const svg = (children: ReactNode) => <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const ART = {
  pictures: svg(<><rect x="14" y="10" width="36" height="28" rx="3" opacity="0.35" /><rect x="10" y="16" width="36" height="28" rx="3" opacity="0.6" /><rect x="6" y="22" width="36" height="28" rx="3" fill="var(--surface)" /><path d="m10 44 9-9 6 6 5-5 8 8" /><circle cx="33" cy="30" r="2.5" /><path d="M48 50h10M53 45v10" className="acc" /></>),
  squares: svg(<><rect x="8" y="8" width="48" height="48" rx="3" />{[20, 32, 44].map((v) => <g key={v}><path d={`M${v} 8v48`} opacity="0.5" /><path d={`M8 ${v}h48`} opacity="0.5" /></g>)}<rect x="32" y="20" width="12" height="12" className="acc-fill" /></>),
  name: svg(<><rect x="6" y="18" width="24" height="24" rx="3" /><path d="M34 30h8m-3-4 4 4-4 4" /><rect x="46" y="12" width="12" height="8" rx="2" opacity="0.4" /><rect x="46" y="26" width="12" height="8" rx="2" className="acc-fill" /><rect x="46" y="40" width="12" height="8" rx="2" opacity="0.4" /></>),
  check: svg(<><rect x="4" y="16" width="22" height="22" rx="3" /><rect x="38" y="16" width="22" height="22" rx="3" /><path d="M28 27h8" strokeDasharray="2 3" /><circle cx="32" cy="50" r="7" className="acc" /><path d="m29 50 2 2 4-4" className="acc" /></>),
};

export function HowItWorks({ index, story }: { index: Index; story: StoryData }) {
  const reveal = useReveal<HTMLOListElement>();
  const a = story.ahmedabad, i = story.india;
  const steps: { art: ReactNode; title: string; text: ReactNode }[] = [
    { art: ART.pictures, title: "Two winter pictures", text: <>Free Sentinel-2 satellite images, 10&nbsp;m per pixel. For each year the clear December–February days are merged into one cloud-free picture.</> },
    { art: ART.squares, title: "Cut into squares", text: <>The picture is cut into 640&nbsp;×&nbsp;640&nbsp;m squares, 64&nbsp;×&nbsp;64 pixels each, the size the model was trained on.</> },
    { art: ART.name, title: "Name each square", text: <>The model picks one of {index.classes.length} land-use classes. It learned from European images, then from {i.n_finetune_patches}<SourceMarker file={i.source} field="n_finetune_patches" /> hand-labelled Indian squares.</> },
    { art: ART.check, title: "Compare and check", text: <>Squares whose name changed between the years are flagged. {a.n_pairs}<SourceMarker file={a.source} field="n_pairs" /> of them were picked at random and checked by eye.</> },
  ];
  return (
    <section className="sec how" id="how" aria-labelledby="howTitle">
      <div className="wrap">
        <div className="sec-head">
          <div><span className="eyebrow">How it works</span><h2 id="howTitle">Four steps, all open.</h2></div>
          <p>Everything runs on free data and free tools. The code, the Indian dataset and every number on this page can be checked.</p>
        </div>
        <ol className="how-steps" {...reveal}>
          {steps.map((s, n) => (
            <li key={s.title} style={{ "--n": n } as CSSProperties}>
              <span className="how-art">{s.art}</span>
              <span className="how-n">{String(n + 1).padStart(2, "0")}</span>
              <b>{s.title}</b>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <ul className="how-links">
          <li><a href={REPO} rel="noopener"><b>Source code</b><span>GitHub</span></a></li>
          <li><a href={DATASET} rel="noopener"><b>Indian dataset</b><span>Hugging Face</span></a></li>
          <li><a href={MODEL} rel="noopener"><b>Model card</b><span>Hugging Face</span></a></li>
          <li><span className="soon"><b>Blog post</b><span>Coming soon</span></span></li>
        </ul>
      </div>
    </section>
  );
}
