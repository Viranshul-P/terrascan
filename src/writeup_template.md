# I trained a satellite land-use model on Europe and tested it on India. Here's what broke.

*Draft for DEV / Medium / Hashnode (step 6.4), generated from `reports/technical_report.md` and `results/` by
`src/tech_report.py`. Live site: {live_site} · Code: {github}*

## The question

Satellite pictures are free: the European Sentinel-2 satellites photograph the whole planet every few days at 10 m
per pixel. Land-use models trained on them look solved on paper. On EuroSAT, the standard European benchmark, my
models reached {eurosat_low}-{eurosat_high} test accuracy, in line with the {published_acc} reported by the dataset's
authors.

But almost every training image is from Europe. What happens when you point the same model at India?

## It falls apart, then partly recovers

I cut Sentinel-2 pictures of five areas in Gujarat into the same 640 m squares and labelled {n_labelled} of them,
with every label reviewed by a person. To keep myself honest I split them **by place**: three areas for tuning, two
areas the model never sees until the end. Neighbouring squares look alike, so a random split would leak answers.

The European model scored **{india_acc_before}** on the Indian test areas (mean ± std over 3 training seeds).
Indian farms, dense old cities, wide muddy rivers and industrial estates do not look like their European
counterparts.

Fine-tuning on {n_finetune} Indian squares, with European images mixed into every epoch so the model doesn't forget
Europe, raised it to **{india_acc_after}**. Better, but it still gets about {india_wrong_pct} of Indian test squares wrong.

## Three bugs that were really data problems

**Different processing levels.** EuroSAT was built from top-of-atmosphere images; the archive I used serves surface
reflectance. Same field, different numbers. I fitted a per-colour straight-line mapping between the two using
**European** scenes only, so no Indian answer could leak into it.

**A hidden +1000.** Sentinel-2 scenes processed with baseline 04.00 or later add 1000 to every pixel value. Old scenes
that were re-processed carry it too, so the date tells you nothing: the fix has to read each scene's metadata.

**A change map that cries wolf.** Compare 2018 and 2026 square by square and the model flags {reported_changed_km2} km² of
Ahmedabad as changed. I checked {change_n_pairs} random flagged squares by eye: only **{real_rate}** were real change.
The rest was the model changing its mind, not the land changing. The website says so next to the map.

## The ideas that didn't work

Before every experiment I committed the decision rule to git: an idea counts only if its average beats the baseline by
more than the seed-to-seed spread. Then I reported whatever came out.

| Idea | Result | Decision |
|---|---|---|
{phase8_short_table}

The honest summary: **{phase8_summary}**. With {n_labelled} labelled squares from one state, the noise between training
runs is as large as most improvements. More, better local labels would matter more than a bigger model.

## Running the whole pipeline in a browser

The part I'm proudest of is engineering, not accuracy. No free server could download satellite pictures and run the
model fast enough, so I moved everything into the visitor's browser. A Web Worker searches the STAC catalogue, reads
only the pixel blocks inside your box from Cloud-Optimised GeoTIFFs with HTTP range requests, reprojects with
hand-written UTM maths, builds the cloud-free composite, and runs the ONNX model with WebGPU (or WebAssembly).

Two copies of a pipeline drift apart quietly: a pixel window off by one, a different rounding rule. So a parity
harness runs both the browser and the Python version on the same boxes: same class for **{parity_same} of
{parity_squares}** squares, square centres {parity_offset_m} m apart.

## What I'd do next

Label squares in more cities, blind to the model, and measure how accuracy grows with the number of local labels.
That's the experiment this project can't fake its way around.

*Every number here is generated from the repository's `results/` folder; nothing is typed by hand.*
