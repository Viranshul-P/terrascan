# TerraScan — Step-by-step build plan

Each step = one Claude Code session, started with `/next`. Each step has:
- **Ask:** what Claude builds in this step (`/next` reads this for you)
- **Done when:** checks that must pass (Claude runs them and shows you the output)
- **You check:** what you personally look at before moving on
- **You do:** originally the user's part. Since 2026-10-30 Claude does these too (see CLAUDE.md), except account,
  login and publishing actions, testing with people, and the launch posts. Who did it is always recorded.
- **Effort: high** (only on some steps): `/next` asks you to switch to high effort first. Every other step runs on medium.

**Order since 2026-11-08:** Phase 8 (India accuracy and the multi-city study) runs before 6.3, 6.4, 7.1 and 7.2. Phase 9 (live API) is optional and last.

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
*Split (user agreed, 2026-11-04): **5.2a** = part 1 (static showcase files, no Docker needed);
**5.2b** = part 2 (FastAPI + Dockerfile + endpoint tests; needs Docker Desktop installed by the user).*
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

### 5.3a Design system and two design directions
**Effort: high**
**Ask:** Before any real build, make 2 different design directions as quick static prototype pages (landing + map
view), take screenshots with Playwright, and show me. I pick one. Then set up the design system in `web/`: one clean
typeface (Inter or the system font), a neutral palette with ONE accent colour, spacing scale, light and dark mode, and
reusable components (button, card, stat, toggle, slider, legend).
Design goals: Apple-like restraint. Clean, calm, lots of whitespace, large confident type for key numbers, nothing
cluttered or "funky". Visual first: every section is one strong visual plus one or two short sentences, never walls
of text.
**Impeccable first:** run `/impeccable init` (this version's name for the old `/teach-impeccable`; it writes
PRODUCT.md) and give it our design brief from PLAN.md as the design context. Before building anything, show me the 2
design directions as screenshots, each with a short note on how it meets every point of our brief (clean Apple-like
restraint, visual first, few words, the globe-to-Ahmedabad 3D moment, purposeful motion, fast). I'll also share
reference screenshots of sites I like; match their feel. **Don't move on until I say I genuinely like a direction.**

### 5.3b The map experience
**Ask:** Build the main map with MapLibre GL:
- Opening: a 3D globe (MapLibre globe projection) that gently rotates, then flies smoothly down to Ahmedabad and tilts
  into a 3D view.
- Before/after swipe slider (2018 | 2026) with the land-use overlay.
- Hover or tap a patch: class, confidence, and "from → to" in compare mode.
- Side panel (bottom sheet on mobile): city picker, class filters that double as the legend, km² bars, "biggest
  changes" list, confidence toggle, downloads.
- "Map your own area": draw a box, clear progress states, honest "waking up the server" message.

### 5.3c The story sections
**Effort: high**
**Ask:** Under the map, a scroll story told mostly with visuals:
1. Europe: model comparison as interactive cards (accuracy, speed, size), including that our small from-scratch CNN
   matches the big pretrained models.
2. India: the drop and the fix (3-seed numbers) as an animated chart with uncertainty bars.
3. Ahmedabad: 320 km² reported → about 163 km² real, shown visually (e.g. a bar that "shrinks" to the verified amount).
4. "What it can't do yet": limitations as a clean, honest section, not hidden.
5. How it works: 4 small illustrated steps, plus links to GitHub, model, dataset, blog.
Every number is read from the data files, never hard-coded. Numbers count up when they scroll into view.

### 5.3d Polish, performance and real users
**Ask:** A full performance and accessibility pass, including `/impeccable critique`, `/impeccable audit` and
`/impeccable polish` before the friends test. Then fix the top 3 problems from my friends test.
**You do:** show the site to 3 friends without explaining. Ask each to (1) find what changed in Ahmedabad, (2) map
their own area. Note where they get stuck.

### Rules for all of 5.3a–5.3d
- Our design brief in PLAN.md is the goal; Impeccable is a tool to reach it. If Impeccable's advice conflicts with the
  brief, the brief wins, except on fonts, where Impeccable's typography guidance replaces "Inter or the system font".
  If you're unsure, ask me.
- End-of-step gate (every 5.3 step, before committing): take desktop and phone screenshots, check them against each
  point of the design brief and the performance budget, and give me a short pass/fail list. Fix any fails first. I'll
  also open it in my own browser and phone to check.
- Motion: smooth and purposeful, never decorative. 200–400 ms transitions, gentle easing or spring feel,
  scroll-triggered reveals, smooth camera moves on the map. Everything respects prefers-reduced-motion.
- 3D: only the globe and terrain tilt from MapLibre. No Three.js or other heavy 3D library unless you show me why
  it's worth the size.
- Performance budget (check it at the end of each step and report the numbers): initial JavaScript at most 200 KB
  gzipped (map tiles not counted), Largest Contentful Paint under 2.5 s on a mid-range phone, layout shift under 0.1,
  smooth 60 fps scrolling, Lighthouse 90+ for performance, accessibility and best practices. Lazy-load the map and
  everything below the fold. Images as WebP or AVIF.
- Code: clean, simple, small components, no unused libraries. Prefer CSS transitions; add an animation library only
  if it's clearly needed and small.
- Works well on a 360 px wide phone, with keyboard, and with colour-blind-safe class colours.

---

## Phase 6 — Deploy (6.1 and 6.2 done; the README and write-up are 6.3 and 6.4, after Phase 8)

### 6.1 Model on Hugging Face Hub
**Ask:** Draft a model card: data, training setup, metrics (pulled from `results/`), domain-shift result, limitations.
**You do:** review every number against the JSON files, then push.

### 6.2 Deploy the API and the website
**Ask:** Prepare the API for a Hugging Face Space (Docker) and the website for free static hosting (GitHub Pages or
Vercel), with the API address set by an environment variable and CORS limited to the website's address.
**You do:** create the Space and the static site, push, then test the live site on your phone on mobile data.
All of this is free: Hugging Face Spaces (free CPU tier), GitHub Pages or Vercel (free tier), no domain name needed.

---

## Phase 8 — India accuracy and the multi-city study

*Added 2026-11-08 (user's decision). TerraScan is now a background research project, not a flagship app. Claude does
all the work; the user approves each plan and does only the unavoidable parts (sign-ups, pushing to Hugging Face).
Phase 8 runs BEFORE 6.3 (README), 6.4 (write-up), 7.1 and 7.2.*

**Goals, in priority order**
1. **Main goal: clearly better detection on Indian land.** Errors the user saw on the live site (reported by the user,
   not yet reproduced with patch IDs; 8.1 does that): the Sabarmati river predicted as crop, residential areas predicted
   as industrial, and city areas predicted as other classes. Current numbers (3 seeds, Indian TEST areas, EfficientNet-B0,
   `results/india_after.json`): accuracy 0.4486 ± 0.0071 before fine-tuning, 0.6831 ± 0.0311 after. Push this as high
   as honestly possible.
2. **A multi-city India evaluation study.** Question: *"How well do EuroSAT-trained CNNs, satellite foundation models and
   global land-cover maps work across Indian cities, and how many local labels does it take to fix them?"*

**Framing rule for every write-up.** EuroSAT RGB is saturated (published results are about 98–99%). Our in-distribution
accuracy is reported as "consistent with published results", never as beating the state of the art. The research value is
the Indian transfer study. No claim of "novel" or "first" without a literature check the user can verify.

**Rules for the whole phase**
- **Label tiers** (see CLAUDE.md): tier 1 = the user's hand labels, the only human gold, used for evaluation. Tier 2 =
  public land-cover products (ESA WorldCover, Dynamic World), "noisy reference". Tier 3 = model-assisted pseudo-labels,
  flagged, training only. Tier 2 and 3 are never called ground truth and never used to evaluate as if they were.
- **Every choice is made on fine-tune / val data only** (EuroSAT val, and the Indian fine-tune areas, with
  leave-one-area-out where a model has been trained on them). The Indian TEST areas (`vadodara_outskirts`,
  `sanand_farmland`) were already scored once in 4.3/4.4 and shown publicly; no decision may be made from them from now
  on. They are used again only in 8.8, together with one completely held-out city.
- A change is kept only if it helps by more than the seed-to-seed noise (3 seeds, as in 2.2c). Every attempt, kept or
  not, is written down.
- Report whatever the numbers are. No tuning toward a target number. Accuracy on a merged or changed class set is not
  comparable to the 10-class numbers; say so wherever both appear.
- The per-scene offset rule and all existing honesty rules in CLAUDE.md stay.
- Do **not** add: multi-agent systems, LLM fine-tuning, or a custom network (unless a plain fine-tune clearly loses).

### 8.1 Error audit
**Effort: medium**
**Ask:** Find out *why* the model is wrong on Indian land, with evidence, before changing anything. (1) Confusion
matrices on the Indian labels: the EuroSAT-only model on the fine-tune areas (it never saw them), and the fine-tuned
model by leave-one-area-out across the three fine-tune areas. The existing TEST-area matrices
(`results/india_before.json`, `results/india_after.json`) are quoted for context only. (2) The failure cases the user
reported (Sabarmati river as crop, residential as industrial, city areas as other classes), each with a **real** patch
file name and latitude/longitude read from `data/india/patches.csv` or `web/public/data/<city>/patches.csv`. Nothing is
invented: if a case can't be found in a file, say so. (3) Which EuroSAT classes hardly or never occur in Gujarat (the
labels so far: SeaLake 0, Pasture 1, River 8 in total and 0 in the test areas; `results/india_dataset.json`), checked
against imagery and, if available, a public land-cover product. (4) Whether brightness or scaling differences between our
pipeline and EuroSAT remain (per-colour statistics of Indian patches vs EuroSAT train after the 4.1 calibration;
`results/imagery_check.json` already says Ahmedabad is brighter and bluer). No retraining in this step.
**Done when:** `results/error_audit.md` exists with the matrices, 6–10 failure cases (patch file, lat/lon, true label,
predicted, confidence, a small picture), the class-occurrence table, the brightness/scaling comparison, and a **ranked
list of likely causes with the evidence for each**. A test checks that every patch file named in it exists in the patch
tables and that the TEST areas were not used for any claim of cause.
**You check:** open 5 of the listed patches and say whether they match what you saw on the live site (especially the
Sabarmati one). Do the ranked causes make sense to you?

### 8.2 Class scheme
**Effort: medium**
**Ask:** Using only the 8.1 evidence and fine-tune/val data, decide whether to keep the 10 EuroSAT classes or use an
India-fit set (for example merge Residential and Industrial into Built-up if they can't be told apart at 10 m; add or
merge water classes). **Decision rule written down before looking at any new numbers:** merge two classes only if they
are confused in both directions in the audit AND the user cannot tell them apart on a small random sample at 10 m. A
merge is never justified by a higher accuracy (merging raises accuracy by construction). Document the class mapping for
**every label source**: EuroSAT's 10 classes, the user's hand labels (tier 1), ESA WorldCover and Dynamic World classes
(tier 2), and pseudo-labels (tier 3).
**Done when:** `configs/classes_india.yaml` (the scheme + one mapping per label source) and `results/class_scheme.md`
(decision, evidence, the sample the user judged) exist; a test checks that every source class maps to exactly one class
of the chosen scheme and that "keep 10" is a valid, tested choice too.
**You check:** look at the 20–30 patch pairs used for the decision. Do you agree you can (or can't) tell the classes apart?
*Change 2026-11-08 (user: "just do everything"): Claude judged the blind quiz instead of the user, so read "the user" above as "the judge"; the report names who judged. The user's re-judge is optional (`--answers <csv> --judge user`). Result: keep the 10 classes; the test was weak (class pairs came from different areas), so this is the safe default, not a proof.*

### 8.3 More spectral bands
**Effort: high**
**Ask:** Compare RGB with RGB+NIR (+SWIR) and with indices (NDWI for water, NDVI for vegetation, NDBI for built-up), on
EuroSAT val and on the Indian fine-tune areas (leave-one-area-out), 3 seeds, one change at a time. Use satellite-pretrained
multispectral weights only if the **installed** torchgeo has them (check the library, don't guess names); otherwise adapt
the first layer of the current weights and say so. **First check, don't assume:** that EuroSAT multispectral (EuroSAT_MS,
13 bands) matches our split files (same images, same classes, same order), and record the check. The Indian side needs
extra bands (e.g. B08, B11) cut with the same pipeline rules (per-scene offset fix, identical grids) and a per-band
L2A→L1C colour fit made on European scenes only, like the 4.1 fit.
**Done when:** `results/bands_comparison.md` lists every variant × (EuroSAT val, India leave-one-area-out) × 3 seeds with
mean ± std and states the decision using the "beyond seed noise" rule; the EuroSAT_MS match check is saved; tests cover
band stacking and the index formulas (division by zero, value range); `pytest` and `ruff check .` pass.
**You check:** read the one-paragraph decision. Is it clear why more bands were kept or dropped?

### 8.4 Noisy labels at scale
**Effort: medium**
**Ask:** Build a large Indian training set from ESA WorldCover and/or Dynamic World for several Gujarat areas (tier 2,
"noisy reference", using the 8.2 mapping). First check availability and licence terms from the sources themselves
(WorldCover is on Planetary Computer; Dynamic World lives in Google Earth Engine, which may need a sign-up that the user
does). Keep the Indian TEST areas, and any area planned as the held-out city, out of this set (spatial separation, with a
buffer). Then train or fine-tune on the tier-2 set, then fine-tune on the hand labels (tier 1, fine-tune areas), and
measure each stage on val/CV: hand labels only; tier 2 only; tier 2 then hand labels. Also report how often the product
agrees with the user's hand labels on the labelled patches (an agreement rate, never "accuracy of the product").
**Done when:** `results/noisy_labels.md` with the set's size, class counts, mapping used, licence note, the agreement rate
and the three-stage table (3 seeds); a test checks that no patch from a test area or the held-out city is in the set;
`pytest` and `ruff check .` pass.
**You check:** look at 20 random tier-2 patches next to the product's label. Do the labels look usable?

### 8.5 Satellite foundation model
**Effort: high**
**Ask:** Check which open geospatial foundation models (for example Prithvi-EO-2.0) can run on this laptop (RTX 4060,
8 GB VRAM). For each candidate record, from its own page and by measuring: licence, expected inputs (bands, image size,
time steps), parameter count, and measured peak VRAM at a stated batch size. Then, for the ones that fit: a linear probe
(frozen features + one layer), then a fine-tune, evaluated like the other models (EuroSAT val, India
leave-one-area-out, 3 seeds). If none fit or none can take our inputs, **skip with a written reason**.
**Done when:** `results/foundation_models.md` has the candidate table (licence, inputs, params, measured VRAM, fits yes/no)
and either the probe/fine-tune results or the reason for skipping; weights come only from the official source and the
licence is respected.
**You check:** is the reason for "fits" or "skip" understandable, and is the licence fine for an open-source repo?

### 8.6 Other ways to improve accuracy
**Effort: medium**
**Ask:** Test these one at a time on fine-tune/val data, keeping each only if it helps by more than the seed noise:
(a) more surrounding context per patch (a larger window around each patch); (b) multi-season input (dry-season plus
monsoon composites; needs data from 8.7, so check cloud-free scene counts first); (c) pseudo-labelling: train on the
model's own high-confidence predictions on unlabelled Indian patches, stored as **tier 3 "model-assisted"**, flagged in
the data and never used for evaluation, with the confidence threshold chosen on val only; (d) test-time augmentation
(flips and 90° turns at prediction time); (e) an ensemble of the best 2–3 models. Later items build on the kept earlier
ones.
**Done when:** `results/india_ablation.md` records **every** attempt, including failures, with settings, 3-seed mean ± std
and the keep/drop decision; a test checks that pseudo-labels are written with the tier-3 flag; the kept recipe is a
config in `configs/`.
**You check:** read the table. Is each keep/drop decision explained in one sentence you can repeat?

### 8.7 Multi-city imagery
**Effort: medium**
**Ask:** Pick 5 to 8 Indian cities in different climates, show the proposal on a map and wait for the user's OK. For each:
imagery for the dry season and the monsoon, with the same pipeline rules (per-scene offset fix from
`s2:processing_baseline`, one identical pixel grid per city, same months every year). Check what data exists first (as in
4.6): monsoon scenes may be cloudy. **Gold labels:** evaluating in other cities needs tier-1 labels there. Ask the user
how to make them (as in 4.2: Claude suggests blind to the model and the user reviews every patch), and fix one city as
the **held-out city**, used for nothing until 8.8.
**Done when:** `results/multicity_scenes.md/json` (scenes per city and season with cloud and baseline), patches cut for
every city, a small figure of the cities, and the label plan agreed; tests use a saved tile (no network).
**You check:** do you agree with the city list and the held-out city? Review the labels you are asked for.

### 8.8 Final evaluation
**Effort: high**
**Ask:** The best pipeline from 8.1–8.6 against the old one, plus **label-efficiency curves** (accuracy against the number
of local labels: 0, 25, 50, 100, all), per-city and per-class results, 3 seeds, bootstrap 95% ranges, and a comparison with
the global land-cover maps on the same patches (mapped with the 8.2 table; WorldCover cannot separate residential from
industrial, so compare at the merged level). Every choice was made earlier on fine-tune/val data; here the Indian TEST
areas and the held-out city are scored once. Report whatever the numbers are, including a result that is no better. No
tuning toward a target number. State plainly that the TEST areas were seen in 4.3/4.4.
**Done when:** `results/india_final.json/.md` and figures: old vs new, label-efficiency curves, per-city/per-class tables;
a test checks that no model setting is read from the test results; a line says which numbers come from which split.
**You check:** read the first paragraph aloud. Is each claim backed by a number and a file name?

### 8.9 Optional extension: surface temperature vs land cover (Ahmedabad)
**Effort: medium**
**Ask:** Optional, marked as an **extension**, not a main result (similar studies exist; no "novel" claim). Use Landsat
thermal data (check availability on Planetary Computer first) to compare land-surface temperature with the model's land
cover for Ahmedabad. Skip terrain/altitude: Ahmedabad is very flat.
**Done when:** `results/lst_ahmedabad.md` with a figure and the limits (resolution mismatch, one date, cloud). Skip the
step, with the reason written, if the data is poor.
**You check:** is it clear this is an extension, and are the limits stated?

### 8.10 Website update
**Effort: medium**
**Ask:** Put the best model from 8.8 on the site: export to ONNX (with the matching test), new showcase files, the new
cities, and re-run the Ahmedabad change study with the new model, including a fresh blind change check (the old 50-pair
check belonged to the old map). Add a visible note "Model predictions. Accuracy on Indian data: <read from the results
file>" and a short "where the model fails" section with real examples from 8.1/8.8. No numbers typed into the UI.
**Done when:** web tests, `tsc`, `pytest` and `ruff check .` pass; the live Lighthouse budget still holds (performance 90+,
LCP under 2.5 s); the note's number equals the value in the results file (tested).
**You do:** push to GitHub (`git push origin main`) and push the new model to Hugging Face (your account).
**You check:** open the site. Do the new cities, the note and the failure examples look right on your phone?

### 8.11 Technical report draft
**Effort: medium**
**Ask:** Write `reports/technical_report.md`: question, data (with label tiers), methods, results, limitations,
reproducibility. In-distribution EuroSAT results are "consistent with published results". Related work is cited only from
sources that were actually opened and checked; no "novel" or "first" claim unless a literature check is shown.
**Done when:** every number traces to a file in `results/` (a test lists the numbers and files), every citation was opened,
and the "how to reproduce" section was followed once by Claude from a clean checkout.
**You check:** read the abstract and the limitations aloud. Can you explain each limitation?

### 8.12 Run it on a new area (CLI or notebook)
**Effort: medium**
**Ask:** A simple command-line tool or notebook so anyone can run the model on a new area: bounding box and year in, class
map and a GeoTIFF out, using the best model and the same pipeline rules. No new web service.
**Done when:** it runs on a saved tile in tests (no network) and on one live box once; the README shows the one-line command.
**You check:** run it on an area you pick. Do the output files open in a map program?

---

## Phase 6 (continued) — README and write-up (runs after Phase 8)

### 6.3 README
**Ask:** Write the README as a short case study. It **opens with the research question and the honest results**, not the
app. Then: approach, results, what failed and how it was fixed. Include the live link, a short GIF of the Compare slider,
the comparison table, the Grad-CAM figure, the domain-shift before/after, the multi-city results and label-efficiency
curves from Phase 8, the change finding, and how to reproduce training. Pull every number from `results/`.
**Done when:** every number in it is filled in by code from the results files, and every link and image path exists.
**You check:** read it out loud. Anything you can't explain, ask Claude about until you can.

### 6.4 Short technical write-up
**Ask:** Instead of a casual blog post: a short technical write-up (about 1,500 words) of the Indian transfer study, made
from `reports/technical_report.md`, for DEV, Medium or Hashnode. Claude writes it; the user approves it.
**Done when:** every number and claim traces to the report or `results/`; no unverified "novel/first" claim.
**You check:** read it aloud. Is every sentence something you can explain?

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
1. Publish the technical write-up from 6.4 (the Indian transfer study, with the Ahmedabad finding).
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

## Phase 9 — Optional, last

### 9.1 Live "Map your own area" API
**Effort: medium**
**Ask:** Only if a free (or user-approved) host can run the API fast enough (see PROGRESS.md Known issues: Hugging Face
Docker Spaces need PRO; Render free at 0.1 CPU timed out in a local test). Use `api/Dockerfile.render`, `render.yaml`,
`CORS_ORIGINS` and `VITE_API_URL`. The API must serve the best model from 8.8 with the same input pipeline.
**Done when:** a drawn 5 × 5 km box returns a map on the live site within the time limit, and CORS refuses other websites.
**You do:** sign up for the host (Claude can't create accounts).
**You check:** try "Map your own area" on your phone.

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
