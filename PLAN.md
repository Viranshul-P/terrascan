# TerraScan — Step-by-step build plan

Each step = one Claude Code session, started with `/next`. Each step has:
- **Ask:** what Claude builds in this step (`/next` reads this for you)
- **Done when:** checks that must pass (Claude runs them and shows you the output)
- **You check:** what you personally look at before moving on
- **You do:** work only you can do. Claude stops and waits for you.
- **Effort: high** (only on some steps): `/next` asks you to switch to high effort first. Every other step runs on medium.

The loop: `/next` → approve the plan → Claude builds, checks, updates PROGRESS.md, commits → `/clear` → `/next`.
See `START-HERE.md` for details.

---

## Phase 0 — Setup (no ML yet)

### 0.1 Repo skeleton
**Ask:** Create the folder layout (`src/`, `configs/`, `tests/`, `scripts/`, `notebooks/`, `results/`, `reports/figures/`),
`requirements.txt` with pinned versions, `.gitignore` (data, models, imagery, wandb, `.claude/settings.local.json` —
but keep the rest of `.claude/` tracked), `ruff` config, one trivial test, and a GitHub Actions workflow that runs
`ruff check` and `pytest` on every push. CI installs the **CPU** build of PyTorch (small and fast); your laptop uses
the CUDA build.
Commit the existing SPEC.md, PLAN.md, PROGRESS.md, CLAUDE.md, START-HERE.md and `.claude/` too.
**Done when:** `ruff check .` and `pytest` pass locally.
**You do:** create an empty **public** GitHub repo called `terrascan` (no README, no licence), give Claude its URL, and
let it push. If git asks you to log in, follow the prompt, or install GitHub CLI and run `gh auth login`.
Then open the Actions tab and confirm the green tick. Step is done when CI is green.

### 0.2 Environment check
**Ask:** Help me install PyTorch with CUDA using the official command from pytorch.org for my OS (plain
`pip install torch` may give a CPU-only build). Then write `scripts/check_env.py` that prints Python, torch, CUDA
availability, GPU name and free VRAM, and runs one small matrix multiply on the GPU.
**Done when:** it prints your RTX 4060 and finishes without errors.
**You do:** create a free W&B account and run `wandb login` yourself.

---

## Phase 1 — Data

### 1.1 Download + split
**Ask:** Download EuroSAT RGB. Make a stratified 70/15/15 split with seed 42 and save it as
`data/splits/train.csv`, `val.csv`, `test.csv` (file path + label). Add tests: no file appears in two splits,
counts add up to 27,000, class proportions match across splits (within 1%).
**Done when:** tests pass.
**Watch out:** if the download link fails, Claude must tell you, not guess a new URL. Find the official source together.

### 1.2 Dataset + augmentations
**Ask:** In `src/data.py`, write a Dataset that reads the split CSVs, and a function that builds the train/val/test
DataLoaders from a config. Train augmentations: horizontal/vertical flips, 90° rotations, light colour jitter.
Val/test: no augmentation. Compute normalisation mean/std from the **train split only** and save them to
`data/stats.json`. Tests: batch shape is `(B, 3, 64, 64)`, labels are in 0–9, val/test transforms are deterministic.
**Done when:** tests pass.
**You check:** ask Claude to explain why stats come from train only. Make sure you can explain it too.

### 1.3 Figures for the README
**Ask:** Script that saves `reports/figures/class_balance.png` and `reports/figures/samples_per_class.png`
(a grid, e.g. 5 images per class), plus a version showing augmented samples.
**Done when:** the three PNGs exist.
**You check:** open them. Do the images look right? Are the labels correct (a "River" should look like a river)?

---

## Phase 2 — Four models, compared fairly

**Seeds rule for this phase:** every *final* model (2.2c, 2.3, 2.4, 2.4b) is trained 3 times with seeds 42, 43, 44
(same splits, only the training randomness changes), saved as `models/<run_name>/seed<N>/`. Results are reported as
mean ± std. Quick experiments in 2.2c can use one seed. Full runs can be left running overnight.

### 2.1 Training loop (before any real model)
**Ask:** Write `src/train.py`: config-driven, AdamW, cosine LR schedule, early stopping on val loss, mixed precision
(AMP) on CUDA, a `--seed` option, W&B logging (loss, accuracy, LR, peak GPU memory), `--fast-dev-run` mode, and save
`models/<run_name>/seed<N>/` (best weights, config copy, metrics.json). W&B can be turned off by a setting, and is off
in tests. Explain AMP to me in 3 sentences.
Test it with a tiny 1-layer model in fast-dev-run mode only.
**Done when:** fast-dev-run finishes, the model folder appears, a W&B run shows up.

### 2.2a Write SmallCNN (Claude writes it, explains it simply)
**Ask:** Write `SmallCNN` in `src/models.py`: 3 blocks of conv → batchnorm → ReLU → maxpool (3 → 32 → 64 → 128
channels, size 64 → 32 → 16 → 8), then flatten → dropout → linear to 10 classes. Add a short comment on every line
saying what it does in plain English, a shape test in `tests/test_models.py`, and a parameter count.
Also write `docs/learn/small_cnn.md`: a beginner explainer of this exact model (what an image is to a computer, what a
filter does, what each block does, why the sizes shrink), with simple diagrams in text. Assume the reader has not
learned neural networks yet. Keep it short.
**Done when:** the shape test passes.
**You check:** skim `docs/learn/small_cnn.md` once. You'll come back to it when your course reaches CNNs.

### 2.2b Train SmallCNN v1
**Ask:** Run `--fast-dev-run`, then full training (seed 42) with `configs/small_cnn_v1.yaml`. Show me the curves and
tell me in 3 plain sentences what they say.
**Done when:** training finishes, `models/small_cnn_v1/seed42/metrics.json` exists, val accuracy is in W&B.

### 2.2c Make SmallCNN better (experiments)
**Effort: high**
**Goal:** improve the CNN the way an ML engineer does: one change at a time, each one measured, kept only if it helps
on **val**. End with a better model and an ablation table for the README showing what worked and what didn't.
**Ask:** Read the SmallCNN v1 results and W&B curves and tell me in plain words what they say. Then propose a ranked list
of 5–8 experiments chosen from that evidence (for example: wider blocks, global average pooling, skip connections,
dropout amount, weight decay, label smoothing, LR warmup, augmentation strength). For each experiment: explain it in one
or two plain sentences, make the change, train one seed, compare val accuracy and val macro-F1 to the current best,
then keep or revert. Add a row to `results/small_cnn_ablation.md`: change, plain-English reason, val acc, val macro-F1,
params, kept? Numbers are copied by code from each run's `metrics.json`, never typed by hand. Add a short section per
kept change to `docs/learn/small_cnn.md`.
**Rules:** decide using **val only**, never test. One change at a time. Stop after ~6 experiments or when gains are
smaller than the seed-to-seed noise (rerun the best one with another seed to check). Training-recipe changes that help
(label smoothing, warmup, weight decay) become the shared default config for every later model so the comparison stays
fair; architecture changes stay SmallCNN-only.
Finally train the final version with seeds 42/43/44 into `models/small_cnn_v2/`.
**Done when:** the ablation table exists, every number traces to a `metrics.json`, and the 3 final runs are saved.
**You check:** read the ablation table. Each row should make sense in plain words.
**Expect:** a small CNN may still trail the pretrained models on accuracy, at a fraction of their size and CPU time.
That trade-off is the finding. Run `/review-step` after this one.

### 2.3 ResNet-18 (transfer learning)
**Ask:** Add ResNet-18 with ImageNet weights, replace the final layer for 10 classes, fine-tune all layers.
Same splits, same max epochs, same early stopping and same shared training recipe as 2.2c.
**Decision to make first:** pretrained models usually do better if 64×64 images are resized up (e.g. to 128 or 224).
Pick one rule, write it in the config, and mention it in the README. Fair = same rule documented, not hidden.
**Done when:** `models/resnet18/seed42/`, `seed43/` and `seed44/` each have a `metrics.json`.

### 2.4 EfficientNet-B0
**Ask:** Add EfficientNet-B0 via `timm` (pretrained), same setup as 2.3.
**Why not ViT:** ViTs need big inputs and lots of data; on 64×64 images it adds pain for little gain. Keep ViT as a stretch idea.
**Done when:** `models/efficientnet_b0/seed42/`, `seed43/` and `seed44/` each have a `metrics.json`.

### 2.4b ResNet-18 pretrained on satellite images (torchgeo)
**Effort: high**
**Why this is worth it:** 2.3 starts from weights learned on everyday photos (ImageNet). This step starts the *same*
ResNet-18 from weights learned on Sentinel-2 satellite images (torchgeo `SENTINEL2_RGB_MOCO`, pretrained on SSL4EO-S12).
Everything else stays identical, so the comparison answers a real question: **does satellite pretraining beat
photo pretraining?** Step 4.3 then asks the same question on Indian imagery.
**Ask:** Add ResNet-18 with torchgeo's `ResNet18_Weights.SENTINEL2_RGB_MOCO`, replace the final layer for 10 classes,
fine-tune all layers. Same splits, epochs, early stopping and image-size rule as 2.3; the only difference is the starting
weights. **Before writing code**, check in the installed torchgeo version: that the weights exist under that name, what
input scaling/normalisation they expect, and what they were trained on. Feed our images the way these weights expect.
Write that choice in the config and in PROGRESS.md "Decisions made". Pin the torchgeo version in requirements.txt.
**Done when:** `models/resnet18_sat/seed42/`, `seed43/` and `seed44/` each have a `metrics.json`.
**Watch out:** if this lands far below 2.3, the input scaling is probably wrong, not the idea. Run `/review-step`.

### 2.5 Evaluation + comparison table
**Effort: high**
**Ask:** Write `src/evaluate.py` that, for each of the four models and each of its 3 seeds, computes on the **test**
split: accuracy, macro-F1, per-class F1, confusion matrix (saved as PNG, seed 42), parameter count, and CPU time per
image (batch size 1, 20 warm-up runs, then the median of 200 runs, fixed thread count). Save everything to
`results/<model>.json` and generate `results/comparison.md` **from those JSON files** with mean ± std across seeds
(no hand-typed numbers). Also include SmallCNN v1 (one seed, marked as such) vs v2 so the improvement from 2.2c shows.
This is the first and only time the test split is used for Phase 2.
**Done when:** `results/comparison.md` exists and every number traces back to a JSON file.
**You check:** do the numbers make sense? (EuroSAT is easy: pretrained models typically land in the high 90s.
If something is at 60%, there's a bug; don't move on.) If two models' mean ± std ranges overlap, say "about the same",
not "A beats B".

---

## Phase 3 — Understand the model

### 3.1 Confusion analysis
**Ask:** Take the best model (highest mean EuroSAT **val** score, seed 42 checkpoint). List the top 5 most-confused
class pairs from its test confusion matrix, and save a grid of
wrongly classified test images for those pairs.
**You do:** look at the grid and write 3–5 sentences in your own words about why the model mixes them up.
Claude can suggest ideas, but the write-up should be yours.

### 3.2 Grad-CAM
**Ask:** Using `pytorch-grad-cam`, save a figure grid with Grad-CAM heatmaps for ~8 correct and ~8 wrong predictions
of the best model. Check the installed library version's API before writing code.
**Done when:** `reports/figures/gradcam.png` exists.
**You check:** heatmaps should differ between images. If they're all blank or all identical, the target layer is wrong.

---

## Phase 4 — Domain-shift test on India

### 4.1 Imagery pipeline (the hardest engineering step; go slow)
**Effort: high**
**Ask:** Write `src/imagery.py`: given a bounding box, date range and max cloud %, search Planetary Computer
Sentinel-2 L2A, pick low-cloud scenes, read bands B04/B03/B02 for the box, remove the +1000 offset for every scene
whose `s2:processing_baseline` is 04.00 or higher (decide per scene, not by date), and convert to RGB scaled the same
way as EuroSAT. Add a test for the offset logic with a fake baseline-03 and a fake baseline-05 scene.
Then save a side-by-side figure: 16 random EuroSAT patches vs 16 patches from your pipeline, plus their colour histograms.
**Done when:** the figure exists.
**You check:** do your patches look similar in brightness and colour to EuroSAT? If they look much darker, brighter
or more washed out, fix the scaling **now**. Otherwise your "domain shift" number will mostly measure a brightness
bug, not a real difference between Europe and India.
**Strong optional control:** run the same pipeline on a European city and look at the model's predictions. If accuracy
looks bad there too, the problem is the pipeline, not India.

### 4.2 Patch cutter + labelling tool
**Ask:** Script that pulls tiles for 4–6 different areas (Ahmedabad city, Vadodara outskirts, farmland, Sabarmati or
Narmada river, an industrial zone), cuts them into 64×64 patches, and saves them with their area name and coordinates.
Then build a small Gradio labeller: shows one patch enlarged, buttons for the 10 classes plus **Skip/unclear**,
saves to `data/india/labels.csv` (file, label, area, lat, lon) after every click, and can resume where you stopped.
The labeller must **not** show any model prediction, so your labels stay independent of the model.
**You do:** label ~150–200 patches yourself. Skip anything unclear.
**Expect this:** some classes (SeaLake, Forest, Pasture) will be rare around Ahmedabad. That's fine. Don't force
20 per class; record what you actually got. Some Indian land (dry riverbeds, bare plots, dense informal housing)
doesn't fit any EuroSAT class. Skip those and mention it as a limitation.

### 4.3 Measure the drop
**Ask:** Split the Indian labels **by area** (e.g. 2–3 areas for fine-tuning, the other areas for testing) so
neighbouring patches never sit on both sides. Evaluate on the Indian test areas: the ImageNet-pretrained model with the
better mean EuroSAT **val** score (2.3 or 2.4) **and** the satellite-pretrained ResNet-18 (2.4b), seed 42 checkpoints. Report accuracy and
macro-F1 with a bootstrap 95% confidence interval, and per-class counts, for both. Save to `results/india_before.json`.
To pick "the best model" for 4.4 onward, compare the two on the Indian **fine-tune** areas, not the test areas
(choosing by test score would quietly leak the test set). Record the choice and why in PROGRESS.md.
**Why by area:** neighbouring patches look almost the same; a random split would let the model "cheat".
**Why the interval:** with ~80–100 test patches, accuracy can easily swing ±5–8 points by chance.

### 4.4 Fine-tune and re-measure
**Ask:** Fine-tune the best model on the Indian fine-tune areas (low LR, few epochs). Re-evaluate on the Indian test
areas **and** on the EuroSAT test set. Save `results/india_after.json`.
**Done when:** you have before/after for India and EuroSAT.
**You check:** did EuroSAT accuracy collapse? If yes, the model "forgot" Europe; lower the LR or mix in EuroSAT data.

### 4.5 Publish the Indian dataset
**Ask:** Prepare all hand-labelled Indian patches for Hugging Face Datasets, with a column saying which are fine-tune
areas and which are test areas, and a dataset card: source (Copernicus Sentinel-2 via Planetary Computer), dates,
areas, how it was labelled (by hand, by you, blind to the model, with skip rules), class counts (from the CSV).
**You do:** review the card, then push it yourself.

---

## Phase 4.5 — Ahmedabad change study

### 4.6 Check data exists before planning around it
**Ask:** For the Ahmedabad box, list available low-cloud Sentinel-2 L2A scenes per month for 2018, 2019 and 2026.
**Why:** older years can have gaps or fewer clear scenes. Check, don't assume. If 2018 is poor, use 2019.
Also list each scene's `s2:processing_baseline` so we know which ones need the offset fix. Pick the **same months in both years**, in the dry season (roughly Dec–Feb) to avoid monsoon clouds.

### 4.7 Build the two maps
**Effort: high**
**Ask:** For each year, build a cloud-free composite (median of several clear scenes, same months), apply the offset fix
per scene **before** taking the median, put both years on the **identical pixel grid** (same projection, bounds and
pixel size, so patch number N is the same place in both years), cut into patches, run the fine-tuned model, and save: a coloured class map PNG per year, area per class in km²
(patch count × 0.4096), and a change matrix (from-class → to-class). Save to `results/change_<years>.json`.

### 4.8 Sanity-check the change (don't skip)
**Why:** two maps each with some error will show "change" even where nothing changed. Errors from both years add up.
**Ask:** Draw a random sample of ~50 patches that the model says changed (e.g. farmland → residential) and show me
the before/after image pairs in a Gradio page with Yes/No buttons.
**You do:** mark whether each change is real. That gives you a "how often is a reported change real" number.
Optional cross-check: compare built-up area against ESA WorldCover (also on Planetary Computer).
**Then:** write the finding with honest limits: patch size (640 m), model error, the verified-change rate, season.

---

## Phase 5 — The website

The website is the first thing a recruiter or stranger sees, so it gets real design attention.
Python backend serves the model; a small web front end shows the map.

### 5.1 ONNX export
**Ask:** Export the fine-tuned model to ONNX. Add a test that ONNX and PyTorch outputs match (within 1e-4) on 20 test images.
**Done when:** test passes.

### 5.2 Backend API + Docker
**Ask:** Two parts.
1. **Pre-computed showcase as static files.** A script that runs the model on 4–6 Indian cities (Ahmedabad, Vadodara
   + others), two years each, and writes everything the website needs into `web/public/data/`: overlay images + map
   bounds, a per-patch grid (class, confidence), km² per class, the from→to change table, and downloadable GeoTIFF
   (correct coordinates), PNG and CSV files. The website reads these directly, so the showcase works even when the API
   is asleep or down.
2. **A small FastAPI service in `api/`** used only for "map your own area": `POST /predict` takes a drawn box (cap it at
   about 10 × 10 km) and a year, fetches imagery, runs the ONNX model, and returns the same format as the static files,
   plus a GeoTIFF download. 60-second timeout with a clear error message. `GET /health` for the website to check
   whether the API is awake.

Dockerfile for the API. Tests for the endpoint and the static-file script using a saved tile (no network in tests).
**Why static files:** the free API host sleeps after a while with no visitors, and waking it takes time. The showcase
must load instantly every time; only the live feature should depend on the API.
**Done when:** the container runs locally and all endpoint tests pass.

### 5.3 Website (the face of the project)
**Ask:** Build the front end in `web/` with Vite + React + TypeScript + MapLibre GL + Tailwind, as a static site.
Use a free basemap that needs no API key; check its usage terms and show its attribution.
**Before building, show me 2 layout options** (simple HTML mockups) and let me pick.

Design brief:
- **Map first.** Full-screen map with a floating side panel (desktop) or a bottom sheet (mobile).
- **The finding in 5 seconds.** It opens on Ahmedabad with a before/after **swipe slider** (2019 | 2026) already on screen,
  and one headline sentence with the key number, read from the data files (never hard-coded).
- **Panel:** city picker, single-year / compare toggle, a legend that doubles as class on/off filters, km² bars per class,
  a "biggest changes" list (e.g. farmland → residential), download buttons, a "show confidence" toggle that fades
  low-confidence patches, and a short Limitations note (640 m patches, accuracy on Indian data, season).
- **Hover or tap a patch:** class, confidence, and in compare mode "from → to".
- **Map your own area:** draw a box, then clear progress states (waking the server → fetching imagery → running model
  → done) and friendly errors. If the API is asleep, say so honestly ("waking up, about a minute") instead of hanging.
- **"How it works" section:** 4 short steps with figures (data, model comparison, domain shift, change check) and links
  to the repo, model, dataset and blog.

Feel and motion: calm and quick. Only purposeful motion: 150–250 ms fades and slides, a smooth fly-to when switching
cities, skeleton loaders while loading. No bouncing or decorative animation. Respect `prefers-reduced-motion`.

Quality bar: colour-blind-safe palette for the 10 classes, keyboard accessible, works at 360 px width,
Lighthouse performance and accessibility both 90+ (save the report to `reports/lighthouse/`), preset cities load in
about 3 seconds on mobile.
**Done when:** the site runs locally (preset cities with the API switched off, live mapping with it on), and the
Lighthouse report is saved.
**You do (30 minutes, high value):** show the site to 3 friends without explaining anything. Ask each to
(1) find what changed in Ahmedabad and (2) map their own area. Note where they get stuck. Then `/next` fixes the top 3
problems. Write 2 lines about it in PROGRESS.md; this becomes a great interview story.

---

## Phase 6 — Deploy + README

### 6.1 Model on Hugging Face Hub
**Ask:** Draft a model card: data, training setup, metrics (pulled from `results/`), domain-shift result, limitations.
**You do:** review every number against the JSON files, then push.

### 6.2 Deploy the API and the website
**Ask:** Prepare the API for a Hugging Face Space (Docker) and the website for free static hosting (GitHub Pages or
Vercel), with the API address set by an environment variable and CORS limited to the website's address.
**You do:** create the Space and the static site, push, then test the live site on your phone on mobile data.
All of this is free: Hugging Face Spaces (free CPU tier), GitHub Pages or Vercel (free tier), no domain name needed.

### 6.3 README
**Ask:** Write the README as a short case study: problem → approach → results → what failed and how it was fixed.
Include the live link, a short GIF of the swipe slider, the comparison table, Grad-CAM figure, domain-shift before/after,
the change finding, and how to reproduce training. Pull every number from `results/`.
**You check:** read it out loud. Anything you can't explain, ask Claude about until you can.

### 6.4 Blog post
**You do:** write it yourself (domain shift + Ahmedabad finding). Claude can review it. A post written by you reads
better and you'll remember the details in interviews.

---

## Phase 7 — Open-source polish + launch

### 7.1 Open-source polish
**Ask:** Add a LICENSE (MIT for the code), and state the licence terms of EuroSAT and of Copernicus Sentinel-2 data for
the imagery and the Indian dataset (check the actual terms, don't guess). Add `CITATION.cff`, `CONTRIBUTING.md`,
issue templates, README badges (CI, live site, model, dataset), and write up 3–5 "good first issues"
(e.g. "add a preset city").
**You check:** open the README on your phone. Can a stranger tell what it does in 10 seconds and try it in 1 click?
**Later, only if people ask for it in issues:** a pip-installable command-line tool for GIS users.

### 7.2 Launch (you do)
**You do**, in this order, spread over about a week:
1. Publish the blog post from 6.4 with the Ahmedabad finding and the domain-shift result.
2. LinkedIn post: one striking before/after map, the finding in one sentence, links.
3. Reddit, one post each, written for that audience: r/remotesensing and r/gis (the site and dataset),
   r/MachineLearning (the domain-shift and pretraining finding, using the [P] project tag), and local subreddits
   for Ahmedabad (the change finding).
4. Hacker News "Show HN" with the live site link.
5. Submit the Indian dataset to curated "awesome" lists of satellite imagery datasets on GitHub.
6. Optional, high value: open an issue on the `torchgeo` repo asking whether the maintainers would accept your Indian
   dataset as a torchgeo dataset. A merged contribution to a major open-source library is a strong resume line.
**Claude can help:** draft each post for its audience. Rewrite them in your own voice before posting.
**Then:** reply to every issue and comment in the first two weeks. That's when people decide whether a repo is alive.

---

## Learn it later (when your course reaches each topic)
Claude Code builds the project now. You learn it properly as your course gets there, using the `docs/learn/` files
and your own code. Before interviews, you must be able to explain each of these in your own words:
- **After your ML basics:** train/val/test splits, overfitting, accuracy vs F1, confusion matrix (Phases 1–2)
- **After neural networks:** what training does, loss, learning rate, ReLU, dropout
- **After CNNs:** read `docs/learn/small_cnn.md`, then rebuild SmallCNN yourself in a scratch file without looking,
  and compare with ours. Then transfer learning (2.3–2.4b) and Grad-CAM (3.2)
- **Anytime:** domain shift and why the area-based split matters (4.3), the change check (4.8), the offset fix (4.1)

---

## Final check before putting it on your resume
- [ ] Every number in README, model card and resume traces to a file in `results/`
- [ ] Live site works from a phone on mobile data, and 3 people used it without help
- [ ] CI is green
- [ ] Fresh clone + README instructions reproduces a training run
- [ ] You can explain: SmallCNN layer by layer, why transfer learning helps, ImageNet vs satellite pretraining, Grad-CAM, why the area-based split,
      why the change check, and the offset fix
