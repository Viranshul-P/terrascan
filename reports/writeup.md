# I trained a satellite land-use model on Europe and tested it on India. Here's what broke.

*Draft for DEV / Medium / Hashnode (step 6.4), generated from `reports/technical_report.md` and `results/` by
`src/tech_report.py`. Live site: https://terrascan-five.vercel.app · Code: https://github.com/Viranshul-P/terrascan*

## The question

Satellite pictures are free: the European Sentinel-2 satellites photograph the whole planet every few days at 10 m
per pixel. Land-use models trained on them look solved on paper. On EuroSAT, the standard European benchmark, my
models reached 98.52%-98.74% test accuracy, in line with the 98.57% reported by the dataset's
authors.

But almost every training image is from Europe. What happens when you point the same model at India?

## It falls apart, then partly recovers

I cut Sentinel-2 pictures of five areas in Gujarat into the same 640 m squares and labelled 230 of them,
with every label reviewed by a person. To keep myself honest I split them **by place**: three areas for tuning, two
areas the model never sees until the end. Neighbouring squares look alike, so a random split would leak answers.

The European model scored **0.4486 ± 0.0071** on the Indian test areas (mean ± std over 3 training seeds).
Indian farms, dense old cities, wide muddy rivers and industrial estates do not look like their European
counterparts.

Fine-tuning on 149 Indian squares, with European images mixed into every epoch so the model doesn't forget
Europe, raised it to **0.6831 ± 0.0311**. Better, but it still gets about 32% of Indian test squares wrong.

## Three bugs that were really data problems

**Different processing levels.** EuroSAT was built from top-of-atmosphere images; the archive I used serves surface
reflectance. Same field, different numbers. I fitted a per-colour straight-line mapping between the two using
**European** scenes only, so no Indian answer could leak into it.

**A hidden +1000.** Sentinel-2 scenes processed with baseline 04.00 or later add 1000 to every pixel value. Old scenes
that were re-processed carry it too, so the date tells you nothing: the fix has to read each scene's metadata.

**A change map that cries wolf.** Compare 2018 and 2026 square by square and the model flags 319 of
Ahmedabad as changed. I checked 50 random flagged squares by eye: only **51%** were real change.
The rest was the model changing its mind, not the land changing. The website says so next to the map.

## The ideas that didn't work

Before every experiment I committed the decision rule to git: an idea counts only if its average beats the baseline by
more than the seed-to-seed spread. Then I reported whatever came out.

| Idea | Result | Decision |
|---|---|---|
| WorldCover-derived training squares | hand labels only 0.655 ± 0.017; WorldCover only 0.438 ± 0.010; WorldCover then hand 0.575 ± 0.024 | No: coarse map labels made it worse. Hand labels only stay. |
| Test-time augmentation, a seed ensemble and pseudo-labels | reference 0.655 ± 0.017; flips/turns 0.678 ± 0.029; seed ensemble 0.671; pseudo-labels 0.685 ± 0.053 | None kept: each gain is inside the seed-to-seed spread. |
| A frozen satellite foundation model | linear probe 0.570 ± 0.037 vs reference 0.655 ± 0.017 | Not better by the rule. |

The honest summary: **none beat the simple fine-tuned model**. With 230 labelled squares from one state, the noise between training
runs is as large as most improvements. More, better local labels would matter more than a bigger model.

## Running the whole pipeline in a browser

The part I'm proudest of is engineering, not accuracy. No free server could download satellite pictures and run the
model fast enough, so I moved everything into the visitor's browser. A Web Worker searches the STAC catalogue, reads
only the pixel blocks inside your box from Cloud-Optimised GeoTIFFs with HTTP range requests, reprojects with
hand-written UTM maths, builds the cloud-free composite, and runs the ONNX model with WebGPU (or WebAssembly).

Two copies of a pipeline drift apart quietly: a pixel window off by one, a different rounding rule. So a parity
harness runs both the browser and the Python version on the same boxes: same class for **272 of
272** squares, square centres 0.0 m apart.

## What I'd do next

Label squares in more cities, blind to the model, and measure how accuracy grows with the number of local labels.
That's the experiment this project can't fake its way around.

*Every number here is generated from the repository's `results/` folder; nothing is typed by hand.*
