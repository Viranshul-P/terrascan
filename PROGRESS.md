# TerraScan — Progress

Claude updates this at the end of every step. Keep entries short.

## Current step
8.3b

## Status
not started
<!-- one of: not started | in progress | waiting on you | done -->

## Waiting on you
(nothing blocks 8.3b.) Deferred by the user, 2026-11-08: the 5.3d friends test (3 people, no explaining; then Claude fixes
the top 3 problems). Start it any time with `/next 5.3d`; details in Known issues. Do it before the launch (7.2).
Note for adding npm packages: npm 10.9.2 crashes when adding vitest ("edgesOut" bug), so packages are added with
`npx -y npm@11.21.1 install ...`; plain `npm ci` works fine.
<!-- When a step needs the user (labelling, W&B login, pushing to Hugging Face, writing a paragraph),
     write exactly what they must do here. /next checks this before moving on. -->

## Steps
- [x] 0.1 Repo skeleton
- [x] 0.2 Environment check
- [x] 1.1 Download + split
- [x] 1.2 Dataset + augmentations
- [x] 1.3 Figures for the README
- [x] 2.1 Training loop
- [x] 2.2a Write SmallCNN (Claude writes it)
- [x] 2.2b Train SmallCNN v1
- [x] 2.2c Make SmallCNN better (experiments)
- [x] 2.3 ResNet-18 (ImageNet)
- [x] 2.4 EfficientNet-B0
- [x] 2.4b ResNet-18 (satellite-pretrained)
- [x] 2.5 Evaluation + comparison table
- [x] 3.1 Confusion analysis
- [x] 3.2 Grad-CAM
- [x] 4.1 Imagery pipeline
- [x] 4.2 Patch cutter + labelling tool
- [x] 4.3 Measure the drop
- [x] 4.4 Fine-tune and re-measure
- [x] 4.5 Publish the Indian dataset
- [x] 4.6 Check data exists (change study)
- [x] 4.7 Build the two maps
- [x] 4.8 Sanity-check the change
- [x] 5.1 ONNX export
- [x] 5.2a Showcase static files
- [x] 5.2b API + Docker
- [x] 5.3a Design system and two design directions
- [x] 5.3b The map experience
- [x] 5.3c The story sections
- [ ] 5.3d Polish, performance and real users  <!-- part 1 done 2026-11-08; friends test + top-3 fixes DEFERRED by the user, see Known issues -->
- [x] 6.1 Model on Hugging Face Hub
- [x] 6.2 Deploy the API and the website (website live; live API deferred, see Known issues)
- [x] 8.1 Error audit (effort: medium)
- [x] 8.2 Class scheme (medium)
- [x] 8.3a Spectral bands: data + code (HIGH; split from 8.3 on 2026-11-08, user OK'd)
- [ ] 8.3b Spectral bands: comparison + decision (HIGH)
- [ ] 8.4 Noisy labels at scale (medium)
- [ ] 8.5 Satellite foundation model (HIGH)
- [ ] 8.6 Other ways to improve accuracy (medium)
- [ ] 8.7 Multi-city imagery (medium)
- [ ] 8.8 Final evaluation (HIGH)
- [ ] 8.9 Optional extension: surface temperature (medium)
- [ ] 8.10 Website update (medium)
- [ ] 8.11 Technical report draft (medium)
- [ ] 8.12 Run it on a new area (CLI or notebook) (medium)
- [ ] 6.3 README (now after Phase 8)
- [ ] 6.4 Short technical write-up (now after Phase 8)
- [ ] 7.1 Open-source polish
- [ ] 7.2 Launch
- [ ] 9.1 Optional, last: live "Map your own area" API

## Log
<!-- One line per finished step: - 0.1 — commit abc1234 — short note -->
- 0.1 — commit a5151ca — repo skeleton pushed to public GitHub repo, CI green
- 0.2 — commit 76c9913 — CUDA torch (cu126) in .venv, check_env.py finds RTX 4060, W&B logged in
- 1.1 — commit de5aec5 — EuroSAT RGB downloaded from Zenodo (MD5 checked), stratified 70/15/15 split (seed 42) in data/splits/
- 1.2 — commit 1647533 — EuroSATDataset + DataLoaders in src/data.py, train-only mean/std in data/stats.json
- 1.3 — commits 8e73222, 2af23c0 + fix — scripts/make_figures.py saves class_balance, samples_per_class, augmented_samples to reports/figures/
- 2.1 — src/train.py (AdamW, cosine LR, early stopping on val loss, AMP, W&B, --seed, --fast-dev-run) tested with TinyNet; fast-dev-run on CUDA saved models/tiny-fast-dev-run/seed42/, W&B run tiny-fast-dev-run-seed42
- 2.2a — SmallCNN (3 conv blocks + dropout 0.3 + linear) in src/models.py, count_parameters, shape test, docs/learn/small_cnn.md, feature-map demo (scripts/cnn_shapes.py)
- 2.2b — SmallCNN v1 trained (seed 42, 30 epochs, W&B run small_cnn_v1-seed42 / 1y2580s3); runs now save history.csv + params; curves in reports/figures/small_cnn_v1_curves.png
- 2.2c — val macro-F1, faster loader, 10 experiments (results/small_cnn_ablation.md), SmallCNN v2 trained with seeds 42/43/44 in models/small_cnn_v2/, docs/learn/small_cnn.md section 8
- 2.3 — ResNet-18 (ImageNet weights, 128×128 input, ImageNet mean/std) trained with seeds 42/43/44 in models/resnet18/; image_size + norm_stats config options
- 2.4 — EfficientNet-B0 (timm 1.0.30, `efficientnet_b0.ra_in1k`) trained with seeds 42/43/44 in models/efficientnet_b0/; shared recipe now runs all 50 epochs (patience 50)
- 2.4b — ResNet-18 with torchgeo SENTINEL2_RGB_MOCO weights (torchgeo 0.10.1), input rescaled to SSL4EO-S12 band stats (checked with scripts/check_sat_scaling.py), seeds 42/43/44 in models/resnet18_sat/
- 2.5 — src/evaluate.py ran once on the TEST split (5 models, 13 runs) → results/<model>.json; scripts/comparison_table.py → results/comparison.md; confusion PNGs in reports/figures/
- 3.1 — src/confusion.py → results/confused_pairs.md + reports/figures/confused_pairs.png (EfficientNet-B0 seed 42); user's notes + Claude's marked ideas in reports/confusion_notes.md
- 3.2 — src/gradcam.py → reports/figures/gradcam.png: Grad-CAM for 8 correct + 8 wrong TEST predictions (random, seed 42) of EfficientNet-B0 seed 42; grad-cam==1.5.7 added
- 4.1 — src/imagery.py (Planetary Computer search, box read, per-scene offset fix, L2A->L1C colour calibration, EuroSAT stretch, patch cutter); scripts/imagery_check.py → reports/figures/imagery_vs_eurosat.png, munich_check_predictions.png, results/imagery_check.json, results/imagery_calibration.json
- 4.2 — scripts/india_patches.py cut 1310 patches in 5 Gujarat areas; src/labeller.py (labeller + --review mode); Claude labelled 368 patches, the user reviewed all of them (final labels are the user's); scripts/india_label_counts.py -> results/india_labels.json
- 4.3 — src/india_eval.py: EfficientNet-B0 and ResNet-18 satellite (seed 42) on Indian labels split by area -> results/india_before.json; EfficientNet-B0 goes on to 4.4
- 4.4 — src/india_finetune.py: EfficientNet-B0 seeds 42/43/44 fine-tuned on the Indian fine-tune areas mixed with EuroSAT train images (models/efficientnet_b0_india/); first try without mixing forgot Europe (kept in models/efficientnet_b0_india_nomix/); before/after on Indian test + EuroSAT test -> results/india_after.json
- 4.5 — src/india_dataset.py builds data/india/hf_dataset/ (train = fine-tune areas, test = test areas, metadata.csv, card from src/india_dataset_card.md); user uploaded it to https://huggingface.co/datasets/viranshul/terrascan-india-gujarat
- 4.6 — scripts/change_scenes.py + src/imagery.month_summary list Sentinel-2 L2A scenes per month for the Ahmedabad change box (Dec 2017–Dec 2019, Dec 2025–Oct 2026) with tile, cloud and processing baseline -> results/change_scenes.json/.md; years and months picked in configs/change.yaml
- 4.7 — src/change.py: median composites of tile 43QBF for Dec 2017–Feb 2018 (13 scenes) and Dec 2025–Feb 2026 (16 scenes), offset removed per scene before the median, one pixel grid checked for all 29 scenes; 2112 patches run through the fine-tuned EfficientNet-B0 (seeds 42/43/44) -> results/change_2018_2026.json + _patches.csv, reports/figures/change_map_2018.png, change_map_2026.png, change_composites.jpg
- 4.8 — src/change_check.py: 50 random 'changed' patches (seed 42) shown as blind 2018/2026 pairs; Claude judged all 50, the user reviewed them (6 answers changed); rate + honest limits in results/change_check.json/.md
- 5.1 — src/export_onnx.py: India fine-tuned EfficientNet-B0 seed 42 -> model.onnx + onnx_info.json; ONNX matches PyTorch on 20 Indian test patches (results/onnx_check.json)
- 5.2a — src/showcase.py + src/onnx_predict.py: static map files for Ahmedabad, Vadodara, Surat, Rajkot (2018 vs 2026, ONNX seed 42) in web/public/data/; Ahmedabad identical to 4.7 (results/showcase.json)
- 5.2b — api/main.py (FastAPI: GET /health, POST /predict) + src/live.py + api/Dockerfile (no PyTorch); torch-free helpers moved to src/composite.py, src/classes.py; container run locally, live 10x10 km box mapped (results/api_check.json); 15 API tests with saved tile + fake model
- 5.3a — commits d93cf29 (prototype E) + step5.3a part 2 — directions A–E (user chose E, built by Claude); React design system in web/src (tokens, Button, Card, Stat, Switch, Segmented, Slider, Legend, SourceMarker), 10 web tests, CI web job; first-load JS 72 KB gz, LCP 0.30 s / CLS 0 (reports/design/5.3a/ds/load_metrics.json, local)
- 5.3b part 2A — phone bottom sheet (Claude): the Layers panel and the square inspector are sheets with 3 heights (peek/half/full; drag, tap or arrow keys; src/lib/sheet.ts, SheetGrabber.tsx); map is fitted above the sheet; credits sit above it; Compare chip shows its label; 5 new tests (23 web tests pass); first-load JS 80.0 KB gz (npm run size)
- 5.3b part 2B — "Map your own area" (Claude): draw a box (drag, or "use the middle of the screen"), box size checked against the server's limits (read from GET /health), year choice, Map this box -> progress state with seconds counter and the server's time limit, honest "server is waking up" note after 3 s without an answer, result on the map (picture, class squares, hover/tap a square) with km² per class, average confidence, GeoTIFF download, Cancel, Draw again. New: lib/api.ts, explorer/useAreaMap.ts, AreaPanel.tsx, DrawLayer.tsx, live layers in map/TerraMap.ts. 24 new web tests (47 pass; fake fetch, no network); first-load JS 83.8 KB gz (npm run size)
- 5.3b part 3 (laptop, 2026-11-07, Claude; from the user's feedback) — commits 59f894b + d8b7671: opening lands flat and centred between the panels (was tilted and low); compass in the zoom bar (needle follows the map, drag sideways = turn, click = north up) and a 3D / 2D button (explorer/ViewControls.tsx); tip on how to turn by hand; gentler wheel zoom; no turning/tilting while drawing an area. 7 new web tests (54 pass). Live "map your own area" API checked on the laptop by Claude with curl (3 km Ahmedabad box, 2018 + 2026 answered, ~30 km box refused); screenshots + load check in reports/design/5.3b/ (LCP 608 ms, CLS 0.008, load_metrics.json). User OK'd 5.3b on 2026-11-07.
- 5.3c part 1 (Claude, 2026-11-07, on medium effort at the user's request) — src/web_story.py writes web/public/data/story.json (Ahmedabad check, India 3-seed numbers, per-model EuroSAT results, each with its source file; 4 pytest tests); Story page at / in React from prototype E (web/src/pages/Story.tsx, story/Chapters.tsx, story/Story.css, lib/story.ts, components/CountUp.tsx): pinned map, hero with count-ups, chapters The city / What the model sees / What changed / How sure (319 -> 163 km² bar that shrinks, 50-square waffle) / Europe -> India (dots ± std) / Limits; header gets a Story link, Explorer stays at /explorer. 14 new web tests (68 pass), incl. one that renders every chapter with made-up numbers to prove nothing is typed in. Screenshots + load check: reports/design/5.3c/ (web/scripts/shoot-story.mjs).
- 5.3c part 2 (Claude, 2026-11-07, medium effort) — under the story map: model cards (story/Models.tsx; Accuracy / Speed / Size switch, "Ours" = best multi-seed from-scratch model, sentence built from range overlaps AND from CPU speed so it also says EfficientNet-B0 is faster), the game ported from prototype E (story/Game.tsx, quiz.json), city cards that change year square by square (story/Cities.tsx, lib/pixelSwap.ts), How it works (4 drawn steps + links: GitHub, Indian dataset; model card and blog shown as "coming soon"), footer with data credits and a plain note that much of the work was done with Claude. Speed fixes after Lighthouse: map loads after the headline (1.6 s or first scroll/touch) and fades in; data files preloaded in index.html; GitHub header link named; footer headings fixed. 10 new web tests (78 pass). Screenshots: reports/design/5.3c/.
- 5.3c — done (user looked at it on laptop/phone and OK'd it, 2026-11-07). Lighthouse performance 81/84 left for 5.3d (user's choice C).
- 5.3d part 1 (Claude, 2026-11-08, high effort; user looked at the site on the laptop and said it looks good, then chose to move on to 6.1 and do the friends test another time; step left unticked) — performance, accessibility and polish; friends test + top-3 fixes still to do (you).
  Speed: the Story shows a still picture of the globe (web/public/globe-light.webp, globe-dark.webp, 45 KB each, made by
  web/scripts/make-globe-poster.mjs + globe_poster.py from the live map) and starts the live map only on the first scroll,
  touch, key or mouse move (the 1.6 s timer is gone); chapter 2's tiles no longer download the 680 KB city picture at load;
  favicon added (the 404); source maps on. Lighthouse (mobile, 5 runs, reports/design/5.3d/lighthouse.json): performance 93-95,
  accessibility 100, best practices 100; BUT simulated LCP 2.72-2.82 s misses the 2.5 s budget (own check 0.44-0.65 s). Impeccable critique (29/40) + detector, then 5 fixes: phone header keeps Story and
  Explorer links; Explorer drops `tile 43QBF` and class code names from the main view (now in tooltips); Cities text no longer says
  "point at"; model sentence says "ResNet-18 (satellite)"; Explorer's credits fold into "i" on phones, +/- hidden on touch, zoom bar
  lifted above credits on desktop; error box has a full outline instead of a side stripe. Audit found and fixed a real bug: on a
  360x740 phone the live globe covered the headline (now a fixed 250 px band for the globe; hero grows taller on short phones).
  Tests: 80 web tests, 130 pytest, ruff clean. New scripts in web/scripts: lighthouse.mjs, load-check.mjs, check-poster.mjs,
  audit-small.mjs, make-globe-poster.mjs (+ globe_poster.py, needs Pillow, which comes with matplotlib).
- 6.1 — src/hf_model.py + src/model_card.md + configs/hf_model.yaml build data/hf_model/ (model.onnx, best.pt, config.yaml, onnx_info.json, README.md = card; seed 42); every number in the card is filled in by code from results/india_after.json, efficientnet_b0.json, change_check.json, change_2018_2026.json, onnx_check.json, india_dataset.json and models/efficientnet_b0_india_nomix/*/metrics.json (tests/test_hf_model.py, 6 tests, incl. "before" = the 3-seed 0.4486 ± 0.0071 and non-overlap claims). Claude created the public repo and uploaded it with the user's already-logged-in `hf` CLI (user asked for this): https://huggingface.co/viranshul/terrascan-efficientnet-b0-india (commit c8cd4ce; README on the Hub is byte-identical to the local card; the card's usage snippet ran from the Hub files; page opened in Chrome). Site: "Model card" is now a link in How it works and the footer (80 web tests pass, first-load JS 96.6 KB gz). 136 pytest, ruff clean.
- 6.2 (Claude, 2026-11-08) — website live at https://terrascan-five.vercel.app (Vercel Hobby, GitHub import of Viranshul-P/terrascan, root `web`, Vite; web/vercel.json rewrites everything to index.html so /explorer opens directly; checked over HTTP: /, /explorer, /data/*.json, globe picture all 200 without login; Story and Explorer opened in Chrome). Lighthouse on the live URL, mobile, 3 runs (reports/design/6.2/lighthouse_live.json): performance 95/96/97, accessibility 100, best practices 100, LCP 2.27-2.31 s (under the 2.5 s budget; the 5.3d local run had 2.72-2.82 s), CLS 0, TBT 94-179 ms. Live API NOT deployed (user's decision): "Map your own area" shows "Live mapping is not switched on in this version of the site yet." Ready for later: CORS_ORIGINS env var in api/main.py (+2 tests), api/Dockerfile.render (model downloaded from the Hub), render.yaml. 138 pytest, ruff clean. Step stays unticked until the user's phone test.
- 6.2 polish (Claude, 2026-11-08, user's request): removed the Design system page and its nav link (web/src/pages/DesignSystem.*, scripts/shoot-ds.mjs); added an About page at /about (web/src/pages/About.tsx; plain text, no numbers of its own, links to code, dataset, model card); nav is now Story / Explorer / About, centred on desktop (grid) and a plain row on phones. 82 web tests pass, tsc clean, screenshots checked at 1440 and 360 px (no sideways scroll). Pushed and live (user pushed ed31872 and 6fafbf9; footer now also links About). Lighthouse re-run on the live URL after this change (reports/design/6.2/lighthouse_live.json now holds THIS run; the first run's numbers are in the line above): performance 95/95/97, accessibility 100, best practices 100, LCP 2.17-2.28 s, CLS 0, TBT 93-196 ms.
- 6.2 — done: user tested the live site on their phone on mobile data (2026-11-08): "all fine". Site https://terrascan-five.vercel.app; live API deferred (see Known issues).

- 8.1 (Claude, 2026-11-08, medium effort) — src/error_audit.py + src/error_audit_report.py (+ src/error_audit_causes.md, configs/error_audit.yaml, tests/test_error_audit.py, 13 tests) -> results/error_audit.md/.json, results/error_audit_predictions.csv, patch pictures in reports/error_audit/. Only the 3 fine-tune areas (149 patches) are used; EuroSAT-only EfficientNet-B0 and leave-one-area-out (LOAO) fine-tunes (4.4 recipe unchanged), seeds 42/43/44. Ranked causes: (1) EuroSAT classes don't fit (wide muddy Narmada called SeaLake; Residential<->Industrial both ways; mixed patches), (2) Indian AnnualCrop looks unlike EuroSAT's (1 of 150 right before, 71 of 150 after LOAO), (3) few uneven local labels, (4) label/mixed-patch doubts (one example), (5) global brightness error unlikely. Live-site 'Sabarmati as crop' mostly NOT reproduced (22 of 29 water squares are River, 1 AnnualCrop). 151 pytest, ruff clean.

- 8.2 (Claude, 2026-11-08, medium effort; user said "just do everything", so Claude judged the quiz) — configs/classes_india.yaml (decision rule committed BEFORE the quiz, commit 6415203; base classes; one mapping per label source: EuroSAT, hand labels, WorldCover, Dynamic World, pseudo-labels; `chosen_merges: {}`), src/class_scheme.py, tests/test_class_scheme.py (20 tests), results/class_scheme.md, results/class_quiz_answers.csv (committed before the key was opened, commit 47603e2), results/class_quiz_key.csv, numbered sheets in reports/class_scheme/. Screen from 8.1 gave 3 pairs: AnnualCrop/Highway, Highway/Industrial, Industrial/Residential. Claude, blind, got 20/20, 19/20 and 19/20 right -> no evidence for merging -> **keep the 10 EuroSAT classes** (a safe default, not a proof: the test was weak). Big caveat (in the report): the two classes of each pair mostly come from different areas (Industrial 8 of 10 from ankleshwar_industrial, Residential 8 of 10 from ahmedabad_city), so the judge may have used scene brightness; the user has not judged the sample. 171 pytest, ruff clean.

- 8.3a (Claude, 2026-11-08, high effort; user said "go ahead, do everything") — EuroSAT_MS downloaded from the same Zenodo record (MD5 matches), read straight from the zip into one memmap (data/raw_ms/, git-ignored); src/bands.py (band stacking, NDVI/NDWI/NDBI, standardising, EuroSATMS + IndiaBands datasets), src/bands_data.py (stages eurosat / india / calibrate), configs/bands.yaml, data/bands_stats.json (EuroSAT train, committed), results/bands_check.json, results/bands_calibration.json, tests/test_bands.py (21 tests incl. real-data ones that skip in CI). Checks: all 27,000 MS images match our split files exactly; full 13-band order confirmed (torchgeo order, B8A LAST, plus data signatures); Indian extra bands for all 5 areas + 4 European scenes read on the existing grid and the new RGB equals the existing values / all 1310 PNG patches exactly; per-band L2A->L1C lines fitted on European scenes only. A first band order (B8A after B08) was WRONG and its calibration was thrown away; fixed and pinned by a test. 199 pytest, ruff clean.

## Decisions made
- **8.3a decisions:** (1) EuroSAT_MS band order = torchgeo's: B01..B08, B09, B10, B11, B12, B8A (B8A last); the SSL4EO-S12 weights expect B8A after B08, so 8.3b must permute (configs/bands.yaml ssl4eo_s12_band_order). (2) RGB channels use the baseline stretch (0..2750 -> 1..255, /255); every other band is value/10000 without clipping; indices use raw values; all non-RGB channels are standardised with EuroSAT-train stats (data/bands_stats.json). B10 is a constant 0 on BOTH sides (L2A scenes have no B10). (3) Coarser bands go onto the 10 m grid with bilinear, chosen from EuroSAT_MS's own signature (its 20 m bands share equal neighbours ~6-8% like 10 m bands ~4%; nearest would give ~50%); bilinear vs bicubic cannot be told apart. (4) Offsets: per-scene rule from the baseline, applied to all 12 bands; the smallest non-zero raw value per band is about 1000 in every offset scene (results/bands_check.json, india_reads). (5) RGB bands keep the 4.1 calibration unchanged so the baseline does not move; the MS-based RGB fit agrees with it (gain 0.92/0.906/0.833 vs 0.907/0.905/0.839). (6) For 8.3b: the RGB variant should be RETRAINED through the MS pipeline for a strictly fair comparison (MS-derived RGB differs from the JPEGs by 1-2 grey levels, results/bands_check.json band_order), instead of reusing models/efficientnet_b0.
- **8.2 after /review-step + code-review (Claude, 2026-11-08):** PLAN.md 8.2 got a one-line note that Claude judged. The report's headline now says 'no evidence for merging, test was weak', and its counts, sample sizes and which pairs share an area are computed from the data, not typed. `--answers` now requires `--judge`, so the report can't call Claude's answers the user's; `score_quiz` rejects answers that are not A/B, duplicated, unknown or missing. Not done (low risk, noted): the audit JSON does not store its class order (screen_pairs trusts src.data.CLASSES), and src/error_audit.py's predict_with_probs runs one batch (fine for ~150 patches, would need batching for many more in 8.4-8.7). 178 pytest, ruff clean.
- **8.2 result:** keep the 10 EuroSAT classes (results/class_scheme.md). The rule could not test River vs SeaLake (SeaLake has 0 Indian labels) or AnnualCrop vs PermanentCrop (PermanentCrop has 2), so it says nothing about them. Source mappings use "could mean" sets: a source class maps to a scheme class only if all its possible EuroSAT classes land in one scheme class, else `ignore` (so WorldCover Cropland, Built-up, Water, Grassland and Shrubland are `ignore` under keep-10; Tree cover -> Forest). Dynamic World classes were read from the official Earth Engine catalogue page on 2026-11-08 (CC-BY 4.0; needs a Google Earth Engine account to download, so no data was fetched). 8.4 must decide how to use the ambiguous tier-2 classes.
- **8.2 (user's decision, 2026-11-08: "just do everything"):** Claude judges the blind pair quiz instead of the user. This changes the rule's wording from "the user cannot tell them apart" to "Claude, judging blind from the 64x64 patches, cannot tell them apart"; it is written into configs/classes_india.yaml before any quiz result exists. Claude's eyes are not the user's, so results/class_scheme.md says so and the user can re-judge the same numbered sheets later (reports/class_scheme/) with `--answers`. Default is conservative: classes stay separate unless the judge is clearly unable (<=70%).
- **8.1 (Claude, user OK'd the plan 2026-11-08):** leave-one-area-out fine-tunes use the 4.4 recipe unchanged (configs/india_finetune.yaml), all 3 seeds, no forgetting check (nothing is published from them; models in models/efficientnet_b0_india_loao_<area>/, git-ignored). Failure cases are picked by a rule in configs/error_audit.yaml (top 6 mistakes of LOAO seed 42, most confident wrong patch each, plus up to 4 wrong River patches), not by eye. The cause text (src/error_audit_causes.md) is hand-written by Claude; its numbers are filled in by code and a test checks the template. ESA WorldCover 2021 v200 (tier 2, noisy) is used only to describe class occurrence and to find the live-site squares that are water / built-up; the water threshold is 20% of a square because a first try at 50% found only 1 square (the Sabarmati is narrower than a 640 m patch).
- **New direction (user's decision, 2026-11-08): Phase 8 comes BEFORE the README.** TerraScan is now a background research project,
  not a flagship app. Claude does all the work; the user approves plans and does only the unavoidable parts (sign-ups, pushing to
  Hugging Face). Main goal: clearly better detection on Indian land (user saw on the live site: the Sabarmati river predicted as
  crop, residential as industrial, city areas as other classes; not yet reproduced with patch IDs, that is 8.1). Second goal: a
  multi-city India evaluation study. New order: 8.1-8.12, then 6.3 README (opens with the research question), 6.4 short technical
  write-up, 7.1, 7.2; 9.1 (live API) optional and last. Numbers to beat (3 seeds, Indian TEST areas, results/india_after.json):
  0.4486 +- 0.0071 before, 0.6831 +- 0.0311 after fine-tuning. Docs changed this session: SPEC.md, PLAN.md, CLAUDE.md (label-tier
  rule replaces "ask who labels"), PROGRESS.md, learn/ (git-ignored), the /next and /progress skills. No code written.
- **Label tiers** (CLAUDE.md): tier 1 = the user's hand labels (only human gold, for evaluation); tier 2 = public land-cover products,
  "noisy reference"; tier 3 = model-assisted pseudo-labels, flagged, training only. Tier 2/3 are never ground truth. All choices
  on val or fine-tune data only; Indian TEST areas + one held-out city scored once, in 8.8 (the TEST areas were already scored in
  4.3/4.4, which every write-up must say). New gold labels in other cities (8.7) need a way agreed with the user at that step.
- Phase 8 step added beyond the user's list: 8.12 (CLI/notebook to run the model on a new area), because the user asked for one.
  9.1 holds the optional live API (see Known issues for why it is not deployed).
- Wording (user's decision, 2026-11-08, for the resume): attribution sentences that are not needed to read the results were cut or
  made neutral, as long as they stay true. Done: model card (no who-did-what), dataset card ("Every patch was reviewed by the
  project owner, who made every final call"; limits line "reviewed by one person"), website footer (Claude line removed),
  Inspector source note, design-system page note. Claude declined to word anything so that it says or implies the user wrote the
  code or labelled alone. Still true and still present: the `first_labelled_by` column values (`claude`/`user`) in the dataset's
  metadata.csv, and the internal logs in the repo (PROGRESS.md, CLAUDE.md, .claude/). The CLAUDE.md honesty rules were not changed.
- 6.1 (user's decision, 2026-11-08): the model card has NO "Who did what" section (user: it is for their resume and they do
  not want it). Removed, re-uploaded (Hub commit bfcc8b1). The user then also had the two method sentences cut (Hub commit
  4bd73b3): the card now only says "All labels were reviewed by a human (one reviewer, no second opinion)" and does not say who
  judged the change check. The dataset card and the website footer still say Claude helped (not changed). Nothing in the card
  claims the user wrote code or labelled alone.
- 6.1 (user OK'd, 2026-11-08): repo `viranshul/terrascan-efficientnet-b0-india`; licence Apache-2.0 (the timm starting weights
  `efficientnet_b0.ra_in1k` are Apache-2.0, read from their Hub README on 2026-11-08; EuroSAT is MIT, from its GitHub LICENSE);
  upload model.onnx + best.pt (seed 42), config, onnx_info. **Exception to "pushing stays with the user":** the user asked
  Claude to do the Hugging Face upload too, through the user's own logged-in Chrome. Recorded here on purpose.
- 5.3d (Claude, user OK'd the plan 2026-11-08): still globe first, live map on first interaction (recommended by Claude, user said OK).
  Because the lab test (Lighthouse) never scrolls, it measures the page WITHOUT the map; the cost of starting the map is measured
  separately (reports/design/5.3d/load_metrics.json). The user's answers after the Impeccable critique: fix all five findings;
  move Explorer's tile and class code names into tooltips. Impeccable's "bounce easing" findings (spring easing with 1.4
  overshoot) are kept: PLAN asks for a spring feel and the brief wins. The Story's small kicker labels ("Europe", "More cities")
  and chapter numbers ("04 / 06") stay as approved in prototype E; Impeccable's floor would drop kickers. User may say if they want them out.
- 5.3c part 2 (Claude): model cards compare by mean ± std ranges (overlap = about the same, the CLAUDE.md rule); the
  sentence is built from the data and also names faster models, so the page doesn't only show what flatters ours.
  A one-seed model shows "1 seed" instead of "± 0". The game's final line uses quiz.json's model_accuracy (seed 42,
  the model behind the maps, labelled "one training run"); the story's India chart keeps the 3-seed numbers.
- 5.3c part 2: links only to things that exist (GitHub; Indian dataset from step 4.5). Model card (6.1) and blog
  (6.4) say "coming soon" until those steps; add the links then. The footer says Claude made the code, website and
  first pass of the Indian labels and the author reviewed them; the user can reword it.
- 5.3c: Lighthouse is run with `npx -y lighthouse@12.0.0` (not added to package.json). With
  --use-angle=swiftshader (software graphics) the 3D map makes performance 39; without it (this laptop's GPU) 63
  before the speed fixes, 81/84 after. The saved file has the runs after the fixes.
- 5.3c part 1 (Claude): the Story keeps prototype E's chapters but tilts the map less (35°/30° in two chapters, flat in
  the rest) after the user found the tilted Explorer view hard to read. Texts that stated a share in words ("About half
  of it is real", "right less than half the time") were reworded so every share on the page is a number from a data
  file ("How much of it held up?" + the % from results/change_check.json). On phones the map credits sit at the top of
  the map, folded into their "i" button (cards cover the bottom).
- 5.3c: patches.csv's row/col are PIXEL positions (multiples of 64), not square numbers; the grid place of a square is
  its index in the file (row = id // grid_cols). The first Story build got this wrong (blank contact-sheet tiles),
  fixed and tested.
<!-- e.g. Pretrained models use 128×128 input (upscaled). Reason: ... -->
- Python 3.12 (not 3.11). Reason: laptop only has 3.12.5; pinned packages resolve fine on it. CLAUDE.md and START-HERE.md updated.
- Project uses a virtual env in `.venv` (git-ignored). Activate with `.venv\Scripts\activate`.
- PyTorch CUDA build: cu126 (`--index-url https://download.pytorch.org/whl/cu126`). Reason: laptop driver 560.94 supports CUDA up to 12.6, and torch 2.14.1 has a cu126 Windows wheel.
- Added `wandb==0.31.0` to requirements.txt (needed for `wandb login` in 0.2).
- EuroSAT RGB source: Zenodo record 7711810 (linked from the authors' GitHub README). MD5 in configs/data.yaml matches Zenodo's API record.
- Split CSVs in `data/splits/` are committed to git (rest of `data/` stays ignored), so everyone and CI use the exact same split. Paths in the CSVs are relative to `data/raw/`.
- Split done with plain pandas/numpy (per class: seeded shuffle, cut 70/15/15), no scikit-learn dependency.
- Label number = position in alphabetical class list `CLASSES` in src/data.py (AnnualCrop=0 … SeaLake=9).
- Train augmentations: random h/v flips, random 0/90/180/270° rotation (own `RandomRot90`, since v2.RandomRotation picks any angle), ColorJitter(0.1, 0.1, 0.1). Val/test: normalise only.
- `data/stats.json` (train-only per-channel mean/std, pixels in 0–1) is committed, like the splits.
- Added `matplotlib==3.11.2` to requirements.txt (figures, step 1.3). README figures in reports/figures/ are committed.
- Training: run with `python -m src.train --config configs/<x>.yaml --seed N`. Fast-dev-run (2 batches, 1 epoch) saves to `models/<run_name>-fast-dev-run/seed<N>/` and is tagged `fast-dev-run` in W&B, so it can't be mixed up with real models.
- Plan change (commit 3340337): user is a beginner (ML basics, no neural nets yet), so Claude writes SmallCNN and explains it in `docs/learn/`. User learns it later (see "Learn it later" in PLAN.md).
- SmallCNN v1: 3 blocks conv3x3(pad 1) → BatchNorm → ReLU → MaxPool2, channels 3→32→64→128, size 64→32→16→8, then flatten → Dropout(0.3) → Linear(8192→10). Dropout 0.3 chosen as a common middle value; 2.2c can test others.
- SmallCNN v1 training settings (configs/small_cnn_v1.yaml): AdamW lr 0.001, weight decay 0.05, cosine LR over 30 epochs, patience 5, batch 64. Plain starting values, not tuned.
- Every run also saves `history.csv` (one row per epoch) and `params` in metrics.json. Curves: `python scripts/plot_curves.py <run_dir> <out.png>`.
- ruff: `wandb` marked as known third-party in pyproject.toml, because the local `wandb/` log folder made ruff treat it as our own package.
- W&B on/off is `wandb.enabled` in the train config; off = `wandb.init(mode="disabled")`. Tests never call W&B online.
- Cosine LR steps once per epoch over `epochs` (T_max = epochs). Early stopping keeps the weights from the epoch with the lowest val loss.
- 2.2c keep rule (agreed with user): keep a change only if val macro-F1 rises by more than the seed-to-seed noise (baseline seed 42 vs 43). On a tie, keep it only if it makes the model smaller or simpler; otherwise revert.
- Val macro-F1 is written by hand in `src/metrics.py` (no scikit-learn). `metrics.json` has `best_val_f1`, taken at the same epoch as best val loss.
- Loader (2.2c): `persistent_workers` on, `num_workers` 4. Measured with a timing script: decoding is cheap, the waste was Windows restarting workers every epoch. Images are not cached in memory (didn't need it). This changes the random augmentations, so v1 is retrained as `small_cnn_e0_baseline` for a fair comparison.
- 2.2c options all default to v1: `model_args` (widths, convs, head, dropout) in the config; `label_smoothing` and `warmup_epochs` in the train config. Val loss stays plain cross-entropy even with label smoothing, so early stopping and comparisons stay fair.
- 2.2c method change (agreed with user mid-step): patience 5 stopped runs by chance while val loss was still jumpy, so from experiment 6 on patience is 15 and every experiment runs with seeds 42 and 43; decisions use the 2-seed average. Noise = gap between the two seeds of experiment 6.
- SmallCNN v2 = experiment 8 (`configs/small_cnn_v2.yaml`): 2 convs per block, widths 64/128/256, flatten head, dropout 0.3.
- **Shared training recipe for 2.3, 2.4, 2.4b** (from 2.2c): max 50 epochs, AdamW lr 0.001, weight decay 0.05, cosine LR, label smoothing 0.1, patience 15. No warmup (tested, no gain). Architecture changes stay SmallCNN-only.
  **Changed in 2.4 (user left the choice to Claude): patience 50 = no early stopping; every run does all 50 epochs and keeps the
  lowest-val-loss epoch.** Reason: EfficientNet-B0 with patience 15 stopped 2 of 3 seeds by chance (best epochs 8 and 3,
  models/efficientnet_b0_patience15/seed{42,43}/metrics.json) while the LR was still high. SmallCNN v2 and ResNet-18
  are not retrained: all 6 of their runs have epochs_run 50 (their metrics.json), so patience never cut them short.
  Their configs still say 15, matching how they were trained. 2.4b uses 50.
- **Image-size rule (2.3, also for 2.4 and 2.4b; put it in the README in 6.3):** pretrained models see every image
  (train, val, test) scaled up from 64×64 to 128×128 with bilinear smoothing (`image_size: 128` in the config).
  SmallCNN stays at 64×64. Reason: ImageNet models work better on bigger inputs; 224 has ~3× the pixels of 128 (estimate from pixel count, not measured), so much slower to train.
- ResNet-18 (2.3) is normalised with ImageNet mean/std (`norm_stats` in configs/resnet18.yaml, taken from torchvision's
  `ResNet18_Weights.IMAGENET1K_V1.transforms()`; a test checks they match), not data/stats.json. Rule: feed pretrained
  weights the way they were trained. ResNet-18 = torchvision `resnet18` with its last layer `fc` swapped for 512→10;
  all layers fine-tuned. Same shared recipe and batch size 64 as SmallCNN v2.
- EfficientNet-B0 (2.4) comes from `timm==1.0.30` (added to requirements.txt; pulls in huggingface_hub and safetensors).
  Weights: `efficientnet_b0.ra_in1k` (ImageNet-1k, timm's RandAugment recipe), named exactly in configs/efficientnet_b0.yaml
  so a timm update can't switch them. Downloaded from Hugging Face without a token (no account needed).
  Same 128×128 bilinear rule and ImageNet mean/std as 2.3 (a test checks the mean/std against timm's pretrained_cfg).
  timm's default dropout (0) kept. These weights were trained at 224 with bicubic resizing; we keep one rule for all models.
- **ResNet-18 satellite (2.4b) input scaling.** Weights: torchgeo 0.10.1 (`torchgeo==0.10.1` added to requirements.txt;
  pulls in ~30 packages incl. lightning, kornia, rasterio, geopandas; torch/numpy/pandas unchanged)
  `ResNet18_Weights.SENTINEL2_RGB_MOCO`: SSL4EO-S12 dataset, Sentinel-2 L1C bands B4/B3/B2, MoCo self-supervised,
  downloaded from torchgeo's Hugging Face link. torchgeo says they expect raw Sentinel-2 numbers / 10000; our EuroSAT
  images are 8-bit JPEGs, so that can't be copied directly. Rule used: standardise with data/stats.json, then rescale
  each colour to SSL4EO-S12's B4/B3/B2 mean/std / 10000 (`target_stats` in configs/resnet18_sat.yaml; stats from
  torchgeo `models/resnet.py` `_mean_s2`/`_std_s2`, a test checks them. The same numbers are `S2C_MEAN`/`S2C_STD` in the
  SSL4EO authors' `src/download_data/convert_rgb.py`, main branch, checked by hand on 2026-10-29. torchgeo itself cites
  their `linear_BE_moco.py`/`eurosat_dataset.py` for the normalisation; that script's band stats are a different set,
  tested as a candidate in the check).
  How it was chosen (no val/test used): `scripts/check_sat_scaling.py` feeds 512 train images through the pretrained
  first layer and compares its output mean and spread with those stored in the first BatchNorm layer during
  pretraining; the config's scaling was the closest of 4 candidates on both (results/resnet18_sat_scaling_check.txt;
  spread added after /review-step).
  The model is torchgeo's (timm) ResNet-18: same design and parameter count as 2.3's.
- Evaluation (2.5): each run is reloaded with its own saved config.yaml (same image size and scaling as in training),
  predictions in float32 (no AMP). CPU time = model only, batch 1, 1 thread, median of 200 after 20 warm-ups, on this
  laptop. Settings in configs/evaluate.yaml. No W&B for evaluation (PLAN asks for JSON files; PLAN wins over SPEC).
  Reload check on VAL (scripts/val_reload_check.py): seed 42 of all 5 models, reloaded, match their saved
  best_val_acc exactly (results/val_reload_check.txt; first run as a scratch script before the test run, saved after /review-step).
  The test split has now been used once; no model or setting may be changed because of these results.
- Confusion analysis (3.1): `python -m src.confusion --config configs/confusion.yaml`. Best model picked in code by
  highest mean VAL accuracy over seeds 42/43/44 (EfficientNet-B0, 0.9897), seed-42 checkpoint. A "pair" counts both
  directions together (A→B plus B→A); the table shows each direction. The script stops if its confusion matrix differs
  from the one saved in results/efficientnet_b0.json (it matched). Grid shows every mistake for each top-5 pair (max 10).
- 3.1 write-up: user wrote the observations (section 1 of reports/confusion_notes.md, Claude only fixed spelling). User
  then explicitly waived the "write-up must be yours" rule for this step; Claude's added ideas are in a separate,
  clearly marked section and are untested hypotheses (to check in 3.2 Grad-CAM and 4.3).
- Grad-CAM (3.2): `python -m src.gradcam --config configs/gradcam.yaml`. Library `grad-cam==1.5.7` (import name
  `pytorch_grad_cam`; pulls in scikit-learn, scipy, opencv-python-headless and 5 smaller packages; torch/numpy unchanged).
  Same best-model pick as 3.1 (mean VAL acc). Examples picked at random with seed 42, not by hand. Heatmap is for the
  model's *predicted* class. Target layer `bn2` (timm name: last conv layer's output after BatchNorm + SiLU).
  Claude wrote the code and judged the figure (no "You do" part in this step).

- Workflow change (2026-10-30, user's decision): Claude now does the "You do" parts too, except account/login/
  publishing actions, testing with real people and launch posts. Whoever did each part is recorded honestly
  (CLAUDE.md, PLAN.md legend, /next skill updated). Exception still open: Indian labels (4.2) and the change
  check (4.8). The user decides then who does them; ask before starting.
- Imagery (4.1): `pystac-client==0.9.1` + `planetary-computer==1.0.0` added (pull in pystac 1.15.2, ~25 small pystac
  extension packages, python-dotenv, pytz; nothing existing upgraded). Planetary Computer needs no account or key.
  Only collection is `sentinel-2-l2a` (checked: no L1C there). Scene rule: keep scenes whose footprint fully contains the
  box (Ahmedabad sits where tiles 43QBF and 42QZL overlap), take the lowest `eo:cloud_cover` (whole-scene cloud).
  Offset: subtract 1000 when `s2:processing_baseline` >= 04.00, parsed as numbers ("05.12" -> (5, 12)), floor at 0.
- EuroSAT stretch: values 0-2750 -> 1-255, clipped (EuroSAT authors' README FAQ, github.com/phelber/EuroSAT:
  `gdal_translate ... -scale 0 2750 1 255 -b 4 -b 3 -b 2`; the README calls it "one option", checked 2026-10-30).
- **Colour calibration (4.1, user chose it after seeing the first figure).** EuroSAT was made from L1C (has band B10,
  which only L1C has: haze included); we only have L2A (haze removed). With the plain stretch, a European control
  (Munich) came out much less blue than EuroSAT, so the domain-shift number would have mixed in a colour bug. Fix:
  per colour, `gain * L2A value + shift` before the stretch, fitted by matching percentiles 5..95 of three European
  summer scenes (Lyon, Poznan, Utrecht) to 1000 EuroSAT TRAIN images. Munich held out as the check, Ahmedabad never
  used in the fit. Fitted numbers in results/imagery_calibration.json; 4.2+ must load them from there, unchanged.
  Claude wrote the code and judged the figures by eye (no "You do" part in this step).
- **Indian labels (4.2): Claude labels, the user reviews and corrects** (user's decision, 2026-11-03, changed from
  "the user labels by hand"). Claude recommended the user label by hand (SPEC: "by hand by me (not by an AI)") and
  offered this middle option; the user chose it. Claude labels blind to model predictions; every label is then shown to
  the user, who agrees or corrects it. Claude wrote the patch cutter and the labeller.
  **Agreed wording for README, dataset card and blog (updated 2026-11-04, user chose it):** Claude (an AI) suggested
  a label for each patch, blind to the model. The user went through every patch; by their own account they decided
  before reading Claude's suggestion, then compared. In 2-3 early cases Claude's label helped them understand a class
  and they changed their mind. They kept all of Claude's class labels and labelled the patches Claude skipped; they
  made every final call. Counts from results/india_labels.json. The data shows no Claude class label was changed, so
  don't write that the user caught Claude's wrong classes. The user's pre-comparison labels were not saved, so no
  agreement %/kappa can be computed (asked for 2026-11-04, skipped). README text waits for 6.3.
  Don't write that the user labelled them alone. (The review app shows Claude's label on screen with the patch.)
- Indian areas (4.2, configs/india.yaml): 5 non-overlapping boxes in Gujarat, about 10 km wide: Ahmedabad city (same box
  as 4.1), Vadodara west edge, farmland SW of Sanand, Narmada at Bharuch, Ankleshwar GIDC. Boxes picked by Claude from
  rough place coordinates, checked by eye in reports/figures/india_areas.png. Dry season, Jan-Feb 2026, clearest scene
  per area, same pipeline and 4.1 calibration unchanged. `python scripts/india_patches.py --config configs/india.yaml`
  -> PNGs in data/india/patches/ + data/india/patches.csv (git-ignored) + results/india_patches.json.
- **How Claude labelled (4.2):** looked at the first 368 patches of the labeller's shuffled order (seed 42) as
  numbered 4x4 sheets enlarged with sharp pixels (scratch script, not kept), next to the EuroSAT examples figure; never
  saw any model prediction for Indian patches. Rules used: class covering most of the patch; hazy patches, mixed
  patches (no class clearly over half) and land that fits no class (bare plots, construction, mudflats, scrub) =
  skip; Highway = a wide road or flyover clearly crossing the patch (as in EuroSAT's Highway examples); tree-covered
  campuses and orchards skipped rather than called Forest/PermanentCrop. Stopped once the labelled count reached the
  150-200 target. `labels.csv` has a `labelled_by` column (`claude` for all of these, `user` for app clicks).
- Review mode (`--review` in src/labeller.py): shows each of Claude's labels, the user agrees or corrects;
  `data/india/labels_reviewed.csv` = file, claude_label, final_label, changed, area, lat, lon. The final label is
  the user's. Steps 4.3+ use `final_label`.
- Labeller: `gradio==6.30.0` added (released 2026-10-08; pulls in fastapi, uvicorn, starlette, rich, typer, orjson and
  ~13 smaller packages; nothing existing upgraded). Local only, no share link, no account. Patches shown in a fixed
  shuffled order (seed 42) so areas mix; labels.csv = file, label, area, lat (patch centre), lon; "skip" saved too, so
  resuming skips it. Image sent as PNG (Gradio's default WebP is lossy), enlarged 6x with sharp pixels.
- **Indian split (4.3, configs/india_eval.yaml; Claude proposed, user OK'd):** TEST areas = vadodara_outskirts +
  sanand_farmland (81 patches, 8 classes); FINE-TUNE areas = ahmedabad_city + narmada_bharuch + ankleshwar_industrial
  (149). Split by whole area so look-alike neighbours never sit on both sides. Labels = `final_label`, skips dropped.
  Note: sanand_farmland (test) shares its scene with ahmedabad_city (fine-tune); the areas don't overlap, so no
  shared patches, only the same day's light/haze.
- Indian macro-F1 averages only over classes present in the true labels (absent classes like SeaLake would otherwise
  count as F1 = 0). Bootstrap 95% range: 2000 redraws of the patches, seed 42, 2.5th-97.5th percentile.
  The class set is worked out again in every redraw: rare classes (Pasture 1, PermanentCrop 2, Forest 4 test
  patches) often drop out, so the range mixes 7- and 8-class averages. The macro-F1 range is rougher than accuracy's.
- ImageNet model for 4.3 picked in code by mean EuroSAT VAL acc (EfficientNet-B0, 0.9897), as in 3.1.
- **Model for 4.4: EfficientNet-B0.** Rule fixed before seeing numbers (user OK'd): higher accuracy on the FINE-TUNE
  areas wins (accuracy, not macro-F1, because classes with 1-2 patches make macro-F1 jumpy). Test areas not used.
  "Fixed before seeing numbers" rests on the session record and the config comment only: the config and results came
  in the same commit (59dd5fc), so git can't prove the order. Don't state it more strongly in public text.
  Claude wrote the code; no "You do" part in this step.
- **Fine-tune recipe (4.4, configs/india_finetune.yaml; Claude proposed, user OK'd):** start from each EuroSAT
  EfficientNet-B0 checkpoint (seeds 42/43/44, each fine-tuned with its own seed), all layers, AdamW lr 0.0001,
  weight decay 0.05, label smoothing 0.1, cosine LR, 10 epochs, batch 32, same augmentations as EuroSAT training.
  No Indian val set, so nothing tuned and the LAST epoch is kept. No W&B (history.csv per run instead).
  Forgetting check fixed in advance: EuroSAT VAL accuracy may drop at most 0.02 per seed, else the script stops
  before scoring any test set.
- **First try failed that check, so EuroSAT is mixed in (user's choice after seeing it):** Indian patches only ->
  EuroSAT val acc 0.9884/0.9896/0.9911 -> 0.7701/0.6427/0.7748 (models/efficientnet_b0_india_nomix/seed*/metrics.json,
  log in run_log.txt there). No test set was scored for it. Second try: every epoch = all 149 Indian patches + 600
  EuroSAT TRAIN images drawn fresh (seeded). Decided on val only; test sets scored once, after it passed.
  The no-mix folder was made by the earlier, uncommitted no-mix version of src/india_finetune.py and renamed
  by hand afterwards (its config.yaml and run_log.txt still say efficientnet_b0_india); git can't rebuild that run.
  "Decided on val only, test scored once after" rests on the session record only: code, config and results came
  in one commit (5a409af), so git can't prove the order. Don't state it more strongly in public text.
  After /review-step: main() split into finetune_seeds (Part 1) and score_test_sets (Part 2); a test checks the
  test sets are never scored after a failed val check; one EuroSAT test loader is built once instead of 6 times.
  Refactored Part 2 re-run on the saved models gave output identical to results/india_after.json (scratch check).

- **Indian dataset (4.5, `python -m src.india_dataset --config configs/india_dataset.yaml`):** builds
  `data/india/hf_dataset/` (git-ignored) in Hugging Face's "imagefolder" layout: `train/` (fine-tune areas) and
  `test/` (test areas, same split as 4.3), each with PNGs + `metadata.csv` (file_name, label, split, area, lat, lon,
  scene_id, date, first_labelled_by). Only labelled patches, skips left out, label = `final_label`. No `datasets`
  library needed (not installed; so the folder is not loaded-checked locally, the HF Dataset Viewer will show it).
  Card text in `src/india_dataset_card.md`; every count is filled in by code (also saved to results/india_dataset.json).
  Licence CC-BY-4.0 (user left the choice to Claude). Credit line "Contains modified Copernicus Sentinel data 2026"
  as required by the Copernicus legal notice (sentinels.copernicus.eu Sentinel_Data_Legal_Notice, checked 2026-11-03).
  The card uses the agreed 4.2 labelling wording (Claude first, user reviewed all, final labels the user's), not
  PLAN's "labelled by hand, by you". Claude wrote the code and the card; the upload is the user's (their account).
  After /review-step: build_table stops if any Claude label was changed by the user (the card says the user agreed
  with every Claude label); the area split is read from configs/india_eval.yaml (one copy only); the card's
  hand-written facts ("5 areas", "January-February", shared scene/date) are listed in configs/india_dataset.yaml.
  Rebuilt folder and counts are identical to the uploaded ones (diff -r), so no re-upload needed.
- 4.6 change study (user agreed, 2026-11-03): box [72.40, 22.90, 72.70, 23.15] (about 30 x 28 km, city plus
  surrounding farmland; chosen by Claude, bigger than the 4.1/4.2 city box because most change is on the edges).
  Compare 2018 vs 2026 using the same dry-season months, Dec–Feb (2017-12-01/2018-02-28 vs 2025-12-01/2026-02-28).
  2018 had enough clear scenes, so no fallback to 2019 was needed. Use only tile 43QBF (EPSG:32643) for one grid.
  Settings in configs/change.yaml.
- 4.8 (user's decision, 2026-11-04): Claude judges the change pairs first, the user reviews them (like 4.2).
- 5.1 (user OK'd, 2026-11-04): export seed 42 of efficientnet_b0_india (default seed, not picked by any score). Added onnx==1.23.2 and onnxruntime==1.31.1. Used the older TorchScript exporter (dynamo=False) so onnxscript isn't needed.
  Sample = 50 random patches the map seed (42) says changed class, sample seed 42. The judge sees only the
  2018/2026 crops (patch outlined, 32 px of surroundings), never the model's classes, and answers "did the land
  really change?" yes / no / unclear. Real-change rate = yes / (yes + no), 95% Wilson range; unclear reported
  separately. Optional ESA WorldCover cross-check left out. Settings in configs/change.yaml (check_*).
- 4.7 (user OK'd, 2026-11-03): composite = per-pixel median of ALL clear tile-43QBF scenes in each window,
  keeping the newest processing when a date has two copies. All 3 fine-tuned seeds are run; maps are drawn from
  seed 42; areas and changed km2 are mean +- sample std over seeds. Bias check: a second change matrix leaves out
  patches touching the 4.4 fine-tune areas (only ahmedabad_city lies inside the box). Map colours in configs/change.yaml.
- 5.2 split into 5.2a (static showcase files) and 5.2b (API + Docker), user agreed 2026-11-04. 5.2a cities (user OK'd):
  Ahmedabad (exactly the 4.7 box, tile and cached scenes), Vadodara, Surat, Rajkot, all in Gujarat; new boxes about
  20 x 20 km, picked by Claude from rough coordinates and checked by eye. One tile per city that fully covers the box
  (43QCE, 43QBD, 42QXK). Same years/windows and pipeline as 4.7; model = ONNX seed 42 only (no 3-seed spread on the site).
  configs/showcase.yaml. Run: python -m src.showcase --config configs/showcase.yaml [--city id].
- src/onnx_predict.py runs the ONNX model with numpy + onnxruntime only (no torch), so the 5.2b container can skip
  PyTorch. Its bilinear 64->128 resize is written by hand; a test checks it matches build_transforms within 1e-5.
- web/public/data/ (about 5 MB: overlays, 20 m RGB WebP, GeoTIFF, GeoJSON, CSV, map PNG, summary.json per city, and
  index.json) IS committed: the static website reads it directly. The full-resolution scenes stay git-ignored in imagery/.
  GeoTIFFs: one pixel per 640 m patch, class number (255 = none), UTM projection of the tile, colour table included.
- tests/fixtures/ahmedabad_tile.npz: a real 192 x 192 px crop of two 4.7 Ahmedabad scenes (3 x 3 patches, 346 KB), so
  the showcase tests (and later the API tests) run without network.
- 5.2b (user OK'd, 2026-11-05; Docker Desktop 29.9.2 installed by the user, checked with hello-world): (1) No PyTorch in the API container: the torch-free code of src/change.py moved
  unchanged to src/composite.py, CLASSES to src/classes.py (src.data still exports it). (2) Live maps use at most the
  5 clearest scenes of ONE tile (the tile with the most clear dates in the window), median per pixel; the showcase
  uses all clear scenes. (3) Years 2018 and 2026 only, same Dec-Feb windows. (4) Pinned fastapi 0.162.0, uvicorn
  0.54.0, httpx 0.28.1 (already installed via gradio, no upgrade). api/requirements.txt = slim container list.
  /predict answers in the summary.json format for one year (no change table) + patches_geojson; "files" are data URLs
  (PNG overlay, WebP picture, GeoTIFF) instead of file names. Box limit 10 x 10 km (422 with a plain message), 60 s
  limit (504). CORS allows any origin (public, read-only). Settings: configs/api.yaml (a test checks the shared keys
  equal configs/showcase.yaml). Docker: docker build -f api/Dockerfile -t terrascan-api . ; the git-ignored
  model.onnx is copied from the local models/ folder (6.2 must get it from Hugging Face instead).

- Impeccable design skill (2026-11-04, user asked): copied from the official repo github.com/pbakaus/impeccable
  (Apache-2.0, commit 695cea5, skill 4.8.0) into .claude/skills/impeccable and .claude/agents/impeccable-*.md, project
  only; our next/progress/review-step skills unchanged (checksums). Its hooks (.claude/settings.json) were NOT
  installed: they run a downloaded engine on every edit without approval. `/teach-impeccable` is now `/impeccable init`.
  Telemetry: the skill fetches design directions from impeccable.style when a design starts.
- 5.3a (2026-11-05): styling is plain CSS with CSS custom properties, no Tailwind (user's choice). The user OK'd running
  Impeccable. PRODUCT.md written by Claude via `/impeccable init` from SPEC/PLAN plus the user's answers: main users are
  recruiters + engineers; key message "an AI that maps how Indian cities changed, and honestly tells you how wrong it
  can be"; English only; limitations always visible. No image generator here, so Impeccable runs "code-first".
- 5.3a: web/package.json pins playwright 1.64.1 (matches the cached Chromium 1248), maplibre-gl 6.15.0 (6.16.0 was
  under 2 weeks old), @fontsource-variable/anek-latin 5.3.0 and @fontsource-variable/schibsted-grotesk 5.3.0
  (fonts copied into web/prototypes/fonts, OFL licences next to them). Mona Sans was dropped: Impeccable flags it as overused.
- 5.3a directions (all prototypes by Claude, web/prototypes/a|b|c, notes in reports/design/5.3a/directions.md):
  A "condition report" = Impeccable's roll (seed:2b35c1e9b09beb65, candidate 6 of Claude's 7); B "figure" = Claude's
  top pick; Impeccable's 6 dealt challengers were declined (clash with the brief). Presented as screenshots instead of
  Impeccable's decision web page (PLAN asks for screenshots). The user then asked for light + dark mode and working
  motion and left the choice to Claude, so Claude made C (B's full-screen map opening + A's measured honesty, MapLibre
  globe fly-in, light/dark switch). NOT approved yet; the user wants to review before deciding.
- 5.3a: plain class names on the site (Farmland, Orchards, Scrub and grass, Roads, Housing, Lake) were chosen by Claude,
  not yet confirmed. Headline in C reworded to "The model saw … km² of Ahmedabad change. About … km² really did." so
  the model's report is not stated as fact; wording not decided yet.
- 5.3a round 2 (2026-11-05): the user said C looked "too simple … extremely AI done … no proper UX and navigation".
  User picked all four reference worlds (Apple product pages, crafted product UI, pro map tools, data journalism) and
  OK'd Claude's redesign plan. Claude built prototype D (web/prototypes/d: Story, Explorer, Method & Limits; tokens.css
  + base.css as the design system draft). Globe imagery: NASA Blue Marble via NASA GIBS (no key, CORS open, NASA asks
  for an acknowledgement; NASA data CC0 unless marked; the Blue Marble page itself was not checked). EOX Sentinel-2
  cloudless was NOT used: non-commercial CC BY-NC-SA and no published tile URL. Added JetBrains Mono 5.3.0 (data only).
  Numbers now use en-US grouping (1,311,050) instead of en-IN (13,11,050) for an international audience.
- 5.3a: screenshots are committed as JPEG (reports/design/5.3a/*.jpg, 5.4 MB); the opening videos (*.webm, about 4 MB
  each) stay local (git-ignored). Retake: `npm run shots:prototypes` and `npm run shots:c` in web/.

## Known issues / things to revisit
- **8.3a - the extra-band calibration is shaky:** fitted on 3 European summer scenes, the per-scene gains differ a lot for NIR/SWIR bands (for example B8A 1.08-1.99, B11 1.26-2.38, B06 1.06-1.85; results/bands_calibration.json gain_range_over_scenes), so the line partly fits scene content, not only the atmosphere. Munich (held out) moves closer to EuroSAT in 11 of 12 bands (B04 does not). Several gains are about 1.4-1.5 with shifts near -1000 to -1400, so dark Indian pixels clip to 0. 8.3b must therefore also run the extra bands UNCALIBRATED (src.bands.identity_calibration) and say if the result depends on the calibration.
- 8.3a: not checked: whether EuroSAT_MS values carry any offset (its scenes are 2015-2017, baseline < 04.00, so none is assumed); bilinear vs bicubic; the 60 m bands B01 and B09 and the L1C B10 cirrus (not on the Indian side). NDWI/NDBI use B03/B08/B11 as the standard definitions; no claim of novelty.
- **8.2 for the user (optional):** open reports/class_scheme/quiz_*.png (numbered sheets, no answers on them) and judge them yourself; then `python -m src.class_scheme score --config configs/classes_india.yaml --answers <your csv with columns pair,number,answer>`. A same-area sample (Residential vs Industrial within one scene) would be a fairer test; the rule does not require it. Claude is the same assistant that suggested the first labels for these patches (4.2), so its blindness is by procedure only.
- 8.2: the keep-10 decision means the Narmada river will still be called SeaLake by the model unless more water labels or a naming fix come in 8.4-8.7; the 8.1 audit's cause 1 (Residential vs Industrial) is only weakly supported by this quiz.
- **8.1 for the user to look at:** `narmada_bharuch_r0512_c0640.png` is labelled AnnualCrop but looks to Claude like a town with a diagonal road (judged by eye; the label was NOT changed, it is the user's). Claude's other picture readings (Narmada = wide muddy water, Sabarmati patches = river with bridges and city on both banks) are also by eye. The user's report 'Sabarmati predicted as crop' was not reproduced on the live map; if they saw it somewhere specific, the square or a screenshot is needed.
- 8.1 limits: three seeds share the same 149 patches (± is training noise only); matrix counts add up 3 seeds, so patches are counted 3 times; rare-class rows (3-6 rows) mean little; LOAO models see only 2 areas, so their accuracy is not comparable to the 4.4 test number; the Narmada area holds most of the River and crop labels, so it drives the main errors; brightness per class uses 300 EuroSAT train images per class (seeded). The 'winter crops' reason for the crop colour gap is a guess, not tested.
- 2026-11-08: the old SPEC line "Labelling rules: done by hand by me (not by an AI)" (Phase 4) is out of date; PLAN/CLAUDE.md win
  (4.2 used Claude's first labels with the user's review). CLAUDE.md still says to record who did what in READMEs and cards; the
  user separately asked for no "who did what" section in public text (model card and dataset card were reworded to say the labels
  were reviewed by a human). Not settled in CLAUDE.md; ask the user before writing authorship text in the 6.3 README.
- Phase 8 risk: the Indian gold labels cover only 5 Gujarat areas (230 patches; River 8, SeaLake 0, Pasture 1 in total:
  results/india_dataset.json). Evaluating in other cities needs new tier-1 labels (8.7).
- 6.2: live "Map your own area" is not deployed. Free options checked 2026-11-08: Hugging Face Docker Spaces need PRO; Render free = 0.1 CPU/512 MB and a local run with exactly that cap timed out (HTTP 504 at 60 s) even for a 2 x 2 km box (5 x 5 km takes 26 s uncapped). To add it later: host the image from api/Dockerfile.render (Render Blueprint render.yaml), set CORS_ORIGINS=https://terrascan-five.vercel.app on it, set VITE_API_URL to its address in the Vercel project settings, redeploy. Untested idea: fewer scenes (max_scenes 5) and a smaller max box so a weak free CPU copes. Vercel Hobby is meant for personal, non-commercial use; fine for a portfolio, check their terms if this ever earns money.
- **6.2 BLOCKER (2026-11-08): no free host found that runs the live API well.** (1) Hugging Face: free Docker Spaces now need PRO ("hosting Gradio and Docker Spaces on free cpu-basic requires a PRO subscription"; nothing was created). (2) Render free plan = 0.1 CPU, 512 MB, sleeps after 15 min (render.com/docs/compute-plans and /free, read 2026-11-08). I ran the real image (api/Dockerfile.render, model downloaded from the Hub repo at commit 4bd73b3) locally with `docker run --cpus 0.1 -m 512m`: /health fine, memory about 260 MB (no out-of-memory), BUT a 2 x 2 km box and a 5 x 5 km box both hit the 60 s limit (HTTP 504, about 60 s each). The same 5 x 5 km box took 26 s with no CPU cap. So on 0.1 CPU the live map would mostly time out. Not measured on Render itself (a Docker cap may differ from Render's 0.1 CPU share). Done and kept (commits 891b720 + this one): `CORS_ORIGINS` env var in api/main.py (+2 tests), api/Dockerfile.render, render.yaml (Render Blueprint: free plan, health check /health, CORS_ORIGINS asked at creation). The earlier Hugging Face Space builder was removed (unused).
- 6.1: the card was checked by Claude (code + tests), NOT read line by line by the user (PLAN's "You do: review every number" was done by Claude at the user's request). The user should read it once: https://huggingface.co/viranshul/terrascan-efficientnet-b0-india . To change it: edit src/model_card.md, run `python -m src.hf_model --config configs/hf_model.yaml`, then `.venv\Scripts\hf.exe upload viranshul/terrascan-efficientnet-b0-india data/hf_model .`. The card's usage snippet was run only on an all-black patch (proves it loads and runs, not that predictions are right); it also needs the repo cloned for `src/onnx_predict.py`. The Hub page's model-tree link to timm's base model is set by `base_model:` in the card header (not checked on the page).
- **5.3d is NOT finished: the friends test (3 people, no explaining: "find what changed in Ahmedabad", "map your own area") and the top-3 fixes from it are still to do (user's decision 2026-11-08: later).** Everything else in 5.3d is done and committed (e43bc52). To do it: run `docker run --rm -p 8000:8000 terrascan-api` and, in web/, `npm run dev`, then tell Claude `/next 5.3d`. Do it before the launch (7.2) at the latest; the site is not yet checked with real people.
<!-- e.g. Download from X was flaky, used mirror Y -->
- 5.3c -> 5.3d: Lighthouse performance 81/84 (reports/design/5.3c/lighthouse.json) -> fixed in 5.3d: 93-95 (reports/design/5.3d/lighthouse.json). The favicon 404 is fixed. NOTE: the same 5.3c build scored 92/93/93 when re-run on 2026-11-08 (reports/design/5.3d/lighthouse_before.json), so Lighthouse scores on this laptop swing by about 10 points with machine load; judge by the 5-run spread, not one run.
- 5.3d: Lighthouse's simulated LCP is 2.72-2.82 s (reports/design/5.3d/lighthouse.json), over the 2.5 s budget. Before today's changes it was 2.63-2.71 s; the still-globe picture added about 0.15 s. Our own check (CPU 4x slower, local files, no network delay) gives 444-648 ms (load_metrics.json). Lighthouse uses a simulated slow-4G connection, so the two disagree; the 2.5 s budget is not met on Lighthouse's measure. The floor is FCP 1.8 s (React must run before anything shows). Not fixed: would need a pre-rendered hero in index.html.
- 5.3d: not done / not checked: the live "map your own area" was not re-run against the real server in the browser this step (the friends test does that); real-phone checks are still yours; the Impeccable critique ran in one context, not as two isolated sub-agents (this plan only spawns agents on request), and its browser overlay was not run.
- 5.3d: the still globe's phone size (198.5 px) was measured from a photo, because the live globe is not exactly 2x wider per zoom step (web/src/pages/Story.tsx POSTER). If the globe zoom or the hero layout changes, run `node scripts/make-globe-poster.mjs` again and check with `node scripts/check-poster.mjs`.
- torchvision 0.29 warns that `torchvision.io.decode_image` is deprecated (moving to torchcodec). Works for now. If we switch decoders later, recompute data/stats.json.
- scripts/compute_stats.py takes ~3 min (reads 18,900 images one by one). Only run once, so left simple.
- In fast-dev-run, the 2 val batches are all AnnualCrop (val isn't shuffled), so fast-dev-run val accuracy means nothing. Only real runs count.
- Data loading was the bottleneck in 2.2b (GPU mostly idle, seen by eye in nvidia-smi, not saved to a file). Fixed in 2.2c with persistent workers. Careful: changing `num_workers` (or how workers start) changes which random augmentations each image gets, so it changes results slightly, not just speed. After any loader change, retrain the baseline before comparing experiments to it.
- Experiments 3 and 5 in the ablation table (wider, label smoothing with patience 5) were unfair tests (stopped early); both were re-run fairly as experiments 8 and 7. The table keeps all rows so the story is visible.
- SmallCNN v2's best epoch is still near the end (44–48 of 50, models/small_cnn_v2/seed*/metrics.json), so more epochs might help a little. Not tried: we stopped when gains fell below the noise.
- ResNet-18's best epoch is 50 of 50 for all 3 seeds (models/resnet18/seed*/metrics.json). Val loss had flattened by then (seed 42 curve, looked at by eye: flat from ~epoch 35), and the cosine LR is near 0 at the end, so more epochs would likely add little. Not tested.
- EfficientNet-B0 first attempt (patience 15) is kept in models/efficientnet_b0_patience15/ as evidence; its W&B runs
  `efficientnet_b0-seed42/43/44` from before 16:23 on 2026-10-29 are superseded by the later runs with the same names.
  The seed-44 retrain was also cut off once at epoch 4 (laptop RAM ran low, Claude Code stopped it); that partial
  W&B run can be ignored. The rerun finished normally.
- EfficientNet-B0 seed 44 rerun gave the same best val acc as the first attempt's seed 44 (0.9911, both of their metrics.json),
  as expected since that first run never stopped early. Good sign that runs are repeatable.
- Low laptop RAM made Claude Code stop background training twice (2.4 seed 44, 2.4b seed 44 at epoch 40); both reruns
  finished. The cut-off W&B runs (`efficientnet_b0-seed44`, `resnet18_sat-seed44`, partial) can be ignored. Close
  Chrome tabs before long runs, or run training in your own terminal.
- PLAN's 2.2c "Expect" (small CNN trails pretrained models, at a fraction of their CPU time) did not hold on test:
  SmallCNN v2 is about the same as EfficientNet-B0 on accuracy and slower on CPU (results/comparison.md).
  Not measured why; a likely reason is that v2 runs wide convs (64 channels, twice) at full 64×64 resolution.
- Grad-CAM heatmaps are coarse: at 128×128 input the target layer is only 4×4, so each map is a few blurry blobs.
  Heatmaps do differ between images (Highway and River maps follow the road/river diagonal; water images light up
  almost everywhere), but many land images get a similar central blob, so the figure says little about fine detail.
  An earlier layer (8×8) would give sharper maps; not tried. Judged by eye by Claude, not measured.
- Confidences in the Grad-CAM figure top out around 0.92 even for correct images. Likely because training used
  label smoothing 0.1, which teaches the model not to say 1.0. Not checked further.
- Calibration (4.1) is fitted on only 3 summer scenes; EuroSAT covers all of Europe and all seasons. Crude but checked
  on one held-out area. Ahmedabad (January) after calibration is still brighter and bluer than EuroSAT
  (results/imagery_check.json). Claude reads this as a real difference (bright, dry city) since the held-out European
  area matches, but it can't be fully separated from "the L2A->L1C line differs in India" (more haze there). Not tested.
- Every live scene read in 4.1 was baseline 05.xx, so only the offset-ON path ran on real data; the baseline-03 path is
  covered by the fake-scene test only. 4.6 (2018/2019 scenes) will hit real older baselines.
- Scene choice uses whole-scene cloud %, not cloud inside the box. Fine for the 4.1 scenes (cloud <= 0.01% per scene,
  results/imagery_check.json), but a small cloud could still land in a box. 4.2 patches: look out for it.
- Munich predictions after calibration (results/imagery_check.json): 70 of 289 patches called Highway, which seems a lot
  for a suburb (judged by eye, no labels). Possible model bias on new imagery; worth watching in 4.3.
- The orange/red histogram lines in imagery_vs_eurosat.png have a comb pattern: each 0-255 step covers 10 or 11 raw
  values (2750/254), so neighbouring bins alternate in size. Display effect only.
- planetary-computer 1.0.0 prints a pydantic deprecation warning on import. Harmless.
- Indian patches (4.2): ahmedabad_city and sanand_farmland come from the same scene, ankleshwar_industrial and
  narmada_bharuch from the same date (results/india_patches.json). Ankleshwar's box is shorter, so fewer patches.
  Neighbouring patches look alike: when 4.4 splits labels into fine-tune/test, split by area or by block, not at random,
  or the test score will be too kind.
- Indian labels are very unbalanced (results/india_labels.json): Residential 95 and AnnualCrop 75 of 230; Pasture 1,
  PermanentCrop 4, Forest 5, SeaLake 0. Per-class scores in 4.3 will be meaningless for the rare classes; report
  counts next to them. Many patches skipped (138 of 368), often for haze (judged by eye) or mixed land.
- When running training in the background, use `python -u` so epoch lines show up live in the log (stdout is buffered when redirected to a file).
- 4.3: the big Indian drop is mostly crop fields. On the test areas, 0 of 25 AnnualCrop patches are right for
  EfficientNet-B0 (9 called Pasture, 7 PermanentCrop) and 1 of 25 for ResNet-18 satellite (17 PermanentCrop)
  (results/india_before.json). Residential and Highway hold up much better, so the image pipeline itself seems fine.
  Claude's guess, not tested: dry-season Indian fields (Jan-Feb, bare or stubble) look little like EuroSAT's fields.
- 4.3 numbers are seed 42 only and the test set is small (81 patches): the 95% ranges are wide and the two models'
  ranges overlap, so "about the same" on India, not "A beats B".
- 4.3 drop is not pure "domain shift": models trained on EuroSAT JPEGs (lossy), Indian patches are lossless PNGs. Probably
  a small effect, not measured. Mention it next to any domain-shift claim in README/blog.
- 4.4: the 3 seeds share the same 81 Indian test patches, so the ± over seeds shows training noise only, not
  which patches happened to be picked. Per-seed bootstrap ranges (results/india_after.json) are the better
  guide: for seed 44 the before and after ranges still touch (0.346-0.568 vs 0.543-0.753).
- 4.4: most of the Indian gain is AnnualCrop (seed 42: F1 0.0 -> 0.68, 25 test patches; Residential 0.72 -> 0.91).
  Rare classes stay bad (Pasture 1 patch, PermanentCrop 2: F1 0 after). sanand_farmland (test) shares its scene
  with ahmedabad_city (fine-tune), so part of the gain may be learning that day's light/haze, not India in general.
- 4.4: EuroSAT test drops slightly after fine-tuning and the 3-seed ranges don't overlap (0.9869 ± 0.0013 ->
  0.9828 ± 0.0006, results/india_after.json): a real but small cost, about 0.4 points.
- Why the unmixed fine-tune forgot Europe was not tested. Claude's guesses: the Indian class mix (mostly
  Residential/AnnualCrop) and BatchNorm running averages shifting to Indian colours.
- 4.5 upload checked by Claude via the Hub API (2026-11-03): public dataset viranshul/terrascan-india-gujarat, 149 train + 81 test PNGs, both metadata.csv, README.md, licence cc-by-4.0. The Dataset Viewer (datasets-server) was still processing ("server busier than usual"), so Claude has NOT seen the viewer load it. Moved to "Waiting on you" after /review-step; 4.5 un-ticked until the viewer works. Later the same day the user saw the preview, and Claude checked the datasets-server first-rows API: test returns all 81 rows (image + label, split test only), train returns its first 100 rows (preview limit; 149 PNGs on the Hub). Full row count (/size) was still pending, nothing failed. 4.5 ticked.
- 4.6: every date for the change box exists twice on Planetary Computer, in overlapping tiles 43QBF and 42QZL
  (same picture, different grid). Some 2019 dates also have an older and a re-processed copy of the same tile
  with different baselines (e.g. 2019-03-09: 02.12 and 05.00; 2019-02-12: 02.12 and 03.00), so 4.7 must keep one
  copy per date and still decide the offset per scene. Cloud % is for the whole scene, not the box.
- 4.7: the raw "change" is far too high to be all real: 780 of 2112 patches change class for seed 42 (753-815
  across seeds), results/change_2018_2026.json. By eye (reports/figures/change_map_*.png) the city core is stable,
  but in the farmland ring many patches flip between look-alike classes (top seed-42 moves: AnnualCrop->PermanentCrop
  112, AnnualCrop->Industrial 98, AnnualCrop->Highway 59, Industrial->Residential 58). Crop-to-crop flips are probably
  model error and different crops/stubble in the two winters, not land-use change. Step 4.8 must measure how many
  reported changes are real before any km2 "finding" is written. Claude's by-eye impression (not measured): new suburbs often come out as Industrial.
- 4.7: only 35 of the 306 patches touching the fine-tune area changed (seed 42; 780 total vs 745 outside,
  results/change_2018_2026.json), so the fine-tune overlap is not what drives the change count.
- 4.7 (from /review-step): the model was fine-tuned (4.4) on SINGLE-scene patches from Jan–Feb 2026, but here it
  runs on MEDIAN composites, which look smoother. The 2026 window also covers the same weeks as the fine-tune
  images, so 2026 patches near ahmedabad_city are close to training data. The bias check covers the overlap, not
  the composite-vs-single-scene difference. List both in 4.8's honest limits.
- 4.7: re-running src.change needs the network for the scene search (STAC), even when every scene read is
  already cached in imagery/change/. A re-run from the cache took about 1 minute and gave byte-identical
  results/change_2018_2026.json, _patches.csv and class maps.
- 4.7: the class maps (reports/figures/change_map_*.png) have no coordinates, scale bar or north arrow.
  Add them before 5.x or the README reuses these maps.
- 4.7: the two composites differ a little in colour: median RGB 104/104/111 (2018) vs 101/102/108 (2026)
  (median_rgb_0_255 in results/change_2018_2026.json). 2018 scenes are baseline 02.12, 2026 are 05.11/05.12.
- 4.8: the change check only measures whether reported changes are visibly real, not whether the new class is
  right, and not missed changes. Sample is 50 pairs from seed 42 only (wide range). The user reviewed Claude's
  answers instead of judging from scratch, so final answers may lean towards Claude's (results/change_check.md).
- 4.8 (from /review-step): Claude's blindness was by procedure only (same session could read the class CSV);
  the 119-207 km2 range is sampling error only, for seed 42, not seed spread. Both now stated in change_check.md.

- 5.1: torch.onnx.export with dynamo=False prints a DeprecationWarning (legacy exporter). Works on torch 2.14.1; if a
  future torch drops it, switch to dynamo=True and add onnxscript. The real-model ONNX test needs git-ignored weights
  and patches, so it skips in CI; only the tiny-model export test runs there.
- 5.2a: the change check (4.8, about half of reported changes real) was done for Ahmedabad only. Vadodara, Surat and
  Rajkot show the same top flips (AnnualCrop -> Industrial / Highway; web/public/data/<city>/summary.json), so their
  change numbers are likely just as inflated. Not checked. The site must say this next to any city's change number.
- 5.2a: the background run was stopped once by Claude Code (laptop low on memory) during Rajkot; Rajkot was re-run on
  its own and finished. Ahmedabad's showcase also overlaps the fine-tune area ahmedabad_city (306 patches touch it,
  as in 4.7); the other three cities touch no fine-tune area (results/showcase.json). Vadodara's box contains the
  4.3 TEST area vadodara_outskirts (test data, not training data, so no bias, but worth knowing).
- 5.2a: Rajkot 2018 has only 9 clear scenes (others 12-13). patches.geojson is 0.7 MB for Ahmedabad: 5.3b should
  load it after the map, not up front.
- 5.2b: after a timeout the work thread can't be stopped; it finishes its downloads in the background. No limit on
  requests at once (each holds a few hundred MB while reading). Fine for a demo; revisit if the free host struggles.
- 5.2b: a live map can come from a different tile than the showcase (Ahmedabad live picked 42QZL, the showcase uses
  43QBF) and uses 5 scenes, not all, so live and showcase maps of the same place can differ a little. The model is only
  measured on Gujarat (4.3/4.4); the site must say live maps elsewhere are untested. The container runs as root;
  6.2 (Hugging Face Space) may need a non-root user.
- 5.3a: MapLibre 6.15.0 is about 285 KB gzipped + a 143 KB worker (measured with gzip -9 on the installed files), over
  the 200 KB initial-JS budget. 5.3b must load the map after the text (headline paints first, globe fades in). The two
  Ahmedabad RGB WebPs are 1.28 MB together: too heavy for phones, 5.3b needs smaller versions or tiles.
- 5.3a: prototype C cross-fades 2018 | 2026 instead of the swipe slider in the plan; the swipe needs two synced maps (5.3b).
  C's globe uses demotiles.maplibre.org (free, no key); if it is down the globe is empty. 5.3b could self-host an outline.
- 5.3a (D): the prototypes build HTML with innerHTML from our own data files only (no user input); the React build
  (5.3b) escapes text by default. D's Explorer inspector crops come from the 20 m preview pictures, so they look soft
  (labelled as such). D's "map your own area" is not connected (says so, with the local API timing from
  results/api_check.json). D loads 4 full RGB WebPs for the city cards (lazy): 5.3b needs real thumbnails.
- 5.3a: Impeccable's detector on the prototypes reports only false alarms of a static scan (img src set by JS, white
  text on the always-dark map, "km²" size computed without its parent) and MapLibre's own location-dot CSS.
- 5.3b part 2A: phone checks were run in headless Chromium at 390x844 (taps, a drag, tapping a square): heights peek 76 px,
  half 337 px, full 615 px as designed. NASA/MapLibre demo tiles are blocked in this cloud container, so these checks had
  no globe imagery behind the city; the real phone look still needs your eyes. Known, not fixed: desktop zoom buttons
  overlap the map credits at the bottom right; no favicon (one 404 on every page load). Both go to 5.3d.
- 5.3b part 2B: the API address is the build setting VITE_API_URL (default http://localhost:8000 only in `npm run dev`).
  A production build without it shows "Live mapping is not switched on in this version of the site yet" and disables the
  button (checked in a browser). Step 6.2 must set it to the deployed address when building the site.
- 5.3b part 2B: checked in headless Chromium (desktop 1440x900, phone 390x844) against a MOCK API whose squares are made-up
  test data (layout check only; those screenshots are not committed and show no real result). The phone toolbar fits at
  360, 390 and 412 px wide. The real model + real server were not run (see Waiting on you). Lighthouse was not run.
  Cancelling stops waiting only: the server may finish the job in the background (known from 5.2b).
- 5.3b part 2B: a drawn box is a true lon/lat box only on a flat, north-up map, so opening the tool flattens the map;
  opening Compare closes the tool and the tool turns Compare off (the second map would hide the live layers).
## Results so far (copied from results/ files only, with the file name)
- **Spectral data checks (8.3a, results/bands_check.json):** EuroSAT_MS.zip MD5 091174add3c8e680a49244acf185b9f0 ok; 27000 images in splits = 27000 in zip, 0 missing, 0 extra, class counts equal; red/green/blue match B04/B03/B02 (correlation 0.974/0.966/0.958 with the JPEGs, mean abs difference 1.85/0.93/1.80 grey levels); all-signatures check passes. New RGB pipeline equals the existing PNG patches on all 1310 patches (max difference 0). Calibration check on held-out Munich: closer to EuroSAT in 11 of 12 bands.
- **Class scheme quiz (8.2, results/class_scheme.md, judge = Claude, blind, fine-tune areas only, 20 patches per pair):** AnnualCrop vs Highway 20/20 right; Highway vs Industrial 19/20; Industrial vs Residential 19/20. Rule: merge if <= 70% right, keep if >= 80%. No evidence for merging. Decision: keep the 10 classes (safe default; the test was weak). The area mix of the sample confounds this (see Known issues).
- **Error audit (8.1, results/error_audit.json; fine-tune areas only, 149 patches, mean ± std over seeds 42/43/44):** accuracy EuroSAT-only 0.4653 ± 0.0495; leave-one-area-out fine-tuned 0.6555 ± 0.0169. Per held-out area (EuroSAT-only / LOAO): ahmedabad_city 0.736 / 0.862, narmada_bharuch 0.220 / 0.452, ankleshwar_industrial 0.448 / 0.678. Most frequent mistakes (EuroSAT-only, patch x seed rows): AnnualCrop -> PermanentCrop 109, Residential -> Industrial 49, AnnualCrop -> Pasture 30, River -> SeaLake 12. LOAO: AnnualCrop right 71 of 150, River right 3 of 24, Residential -> Industrial 17, Industrial -> Residential 14. Mean red of AnnualCrop: Indian 0.257 vs EuroSAT sample 0.523; Residential 0.493 vs 0.399; overall gap 0.16/0.15/0.18 EuroSAT std. Live Ahmedabad map vs WorldCover: 22 of 29 water squares River, 1 AnnualCrop; 681 built-up squares: Residential 491, Industrial 165, Highway 20.
- 5.3d Story page, final build (reports/design/5.3d/lighthouse.json, 5 runs of Lighthouse 12.0.0 mobile; reports/design/5.3d/load_metrics.json): performance 93, 93, 94, 95, 95; accessibility 100 all runs; best practices 100 all runs; CLS 0; simulated LCP 2.72-2.82 s (over the 2.5 s budget); TBT 62-131 ms. Own load check (phone window, CPU 4x, 3 runs): LCP 444-648 ms, CLS 0; main-thread blocking over 50 ms per task while settling 183-185 ms, and 14-25 ms in the 6 s after the first scroll (when the map starts). First-load JS 96.6 KB gzipped (npm run size, not saved to a file); the map code and worker (433.8 KB gzipped) load only after the first interaction.
- 5.3c Story page (final build of part 2): own load check, phone size, CPU 4x slower, local: LCP 1820 ms, CLS 0 (reports/design/5.3c/load_metrics.json). Lighthouse 12.0.0 mobile, 2 runs: performance 81 / 84 (FAILS the 90 budget), accessibility 100 / 100, best practices 96 / 96, simulated LCP 2.72 s, TBT 531 / 447 ms, CLS 0 (reports/design/5.3c/lighthouse.json). First-load JS 96.3 KB gzipped (npm run size output, not saved to a file).
<!-- e.g. ResNet-18 test acc: 0.98 (results/resnet18.json) -->
- SmallCNN v1, seed 42 (one seed, VAL split, not test): best val acc 0.9565, best val loss 0.1266 at epoch 30 of 30, 175,626 params, 724 s training (models/small_cnn_v1/seed42/metrics.json)
- SmallCNN v2, seeds 42/43/44 (VAL split, not test): val acc 0.9830 ± 0.0022, val macro-F1 0.9825 ± 0.0023, 1,311,050 params (results/small_cnn_ablation.md, from models/small_cnn_v2/seed{42,43,44}/metrics.json)
- ResNet-18 (ImageNet), seeds 42/43/44 (VAL split, not test): val acc 0.9846 ± 0.0021, val macro-F1 0.9842 ± 0.0021, 11,181,642 params, ~596 s training per seed (computed from models/resnet18/seed{42,43,44}/metrics.json, sample std). Overlaps SmallCNN v2's range, so no "better" claim yet; step 2.5 compares on test.
- EfficientNet-B0 (ImageNet, timm), seeds 42/43/44 (VAL split, not test): val acc 0.9897 ± 0.0014, val macro-F1 0.9894 ± 0.0014, 4,020,358 params, ~888 s training per seed (computed from models/efficientnet_b0/seed{42,43,44}/metrics.json, sample std). On val its range doesn't overlap ResNet-18's; the real comparison is on test in step 2.5.
- ResNet-18 satellite (torchgeo SENTINEL2_RGB_MOCO), seeds 42/43/44 (VAL split, not test): val acc 0.9854 ± 0.0002, val macro-F1 0.9849 ± 0.0002, 11,181,642 params, ~643 s training per seed (computed from models/resnet18_sat/seed{42,43,44}/metrics.json, sample std). Overlaps ResNet-18 ImageNet's range (0.9846 ± 0.0021), so on val there's no evidence that satellite pretraining beats photo pretraining here; step 2.5 compares on test.
- **TEST split (step 2.5), all from results/comparison.md (generated from results/<model>.json):**
  SmallCNN v1 (1 seed) acc 0.9615; SmallCNN v2 0.9874 ± 0.0007, 11.82 ms/image CPU; ResNet-18 ImageNet
  0.9854 ± 0.0002, 14.53 ms; EfficientNet-B0 0.9869 ± 0.0013, 7.57 ms; ResNet-18 satellite 0.9852 ± 0.0011, 14.35 ms.
  Ranges overlap for: SmallCNN v2 vs EfficientNet-B0, and among all three pretrained models (so satellite vs ImageNet
  pretraining: about the same on EuroSAT). SmallCNN v2 vs both ResNet-18s: no overlap, but the gap between the best and
  worst 3-seed means is only 0.22 percentage points (about 9 of 4050 test images).
- Top 5 confused pairs, EfficientNet-B0 seed 42, TEST (results/confused_pairs.md): HerbaceousVegetation/PermanentCrop 10,
  AnnualCrop/PermanentCrop 9, HerbaceousVegetation/Pasture 8, AnnualCrop/Pasture 5, Industrial/Residential 4.
- Imagery check (4.1), mean pixel value per colour R/G/B, 0-1 (results/imagery_check.json): EuroSAT train
  0.345/0.382/0.409. Munich (held out) plain stretch 0.325/0.308/0.228 -> calibrated 0.321/0.364/0.396.
  Ahmedabad plain 0.516/0.466/0.397 -> calibrated 0.495/0.507/0.538. Calibration gain 0.907/0.905/0.839, shift
  70/234/565 (results/imagery_calibration.json). Calibration changed 17.3% of EfficientNet-B0 seed-42 predictions on
  Munich (same_prediction_share 0.827); mean confidence 0.782 -> 0.802 (results/imagery_check.json). No true labels.
- Indian patches cut (4.2, results/india_patches.json): 1310 total; ahmedabad_city 272, vadodara_outskirts 270,
  sanand_farmland 272, narmada_bharuch 272, ankleshwar_industrial 224. All scenes baseline 05.11/05.12 (offset removed).
- Indian labels (4.2, results/india_labels.json): 368 patches reviewed, 230 labelled, 138 skipped. Claude labelled 187;
  the user agreed with all 187 and labelled 43 that Claude had skipped. Per class: Residential 95, AnnualCrop 75,
  Highway 19, Industrial 17, River 8, HerbaceousVegetation 6, Forest 5, PermanentCrop 4, Pasture 1, SeaLake 0.
  Per area (labelled): ahmedabad_city 58, ankleshwar_industrial 29, narmada_bharuch 62, sanand_farmland 22,
  vadodara_outskirts 59.
- **Indian drop (4.3, results/india_before.json), seed 42, TEST areas (81 patches):** EfficientNet-B0 acc 0.444
  (95% range 0.333-0.556), macro-F1 0.371 (0.265-0.522); ResNet-18 satellite acc 0.407 (0.309-0.519), macro-F1 0.293
  (0.209-0.409). Ranges overlap: about the same. Fine-tune areas (149, used for the 4.4 pick): EfficientNet-B0 acc
  0.483, ResNet-18 satellite 0.443. Compare EuroSAT test acc ~0.985-0.987 (results/comparison.md).
- **India fine-tune (4.4, results/india_after.json), EfficientNet-B0, seeds 42/43/44, mean ± std:** Indian TEST
  areas (81 patches) acc 0.4486 ± 0.0071 -> 0.6831 ± 0.0311, macro-F1 0.3729 ± 0.0028 -> 0.4749 ± 0.0126.
  EuroSAT TEST acc 0.9869 ± 0.0013 -> 0.9828 ± 0.0006, macro-F1 0.9862 ± 0.0014 -> 0.9822 ± 0.0006.
  EuroSAT VAL acc 0.9897 ± 0.0014 -> 0.9846 ± 0.0021. Seed 42 Indian test acc 0.444 (95% range 0.333-0.556) ->
  0.716 (0.617-0.815). Fine-tuned on 149 Indian patches (+600 EuroSAT train images per epoch).
- Indian dataset (4.5, results/india_dataset.json): 230 patches, train (fine-tune areas) 149, test 81; per class and
  per area same as results/india_labels.json; first_labelled_by claude 187, user 43.
- Change-study scenes (4.6, results/change_scenes.json, tile 43QBF, whole-scene cloud < 10%): Dec 2017–Feb 2018
  13 clear days, all baseline 02.12 (no offset); Dec 2025–Feb 2026 16 clear days, all baseline 05.11/05.12 (offset).
  Monsoon months (Jul–Aug every year, Sep 2019) have 0 clear scenes.
- Ahmedabad change maps (4.7, results/change_2018_2026.json; RAW model output, not yet checked in 4.8): 2112 patches
  (0.4096 km2 each), mean +- std over seeds 42/43/44. AnnualCrop 245.5 +- 22.4 km2 (2018) -> 140.2 +- 11.9 (2026);
  Residential 226.5 +- 4.7 -> 261.3 +- 15.2; Industrial 138.4 +- 15.4 -> 192.6 +- 28.1; Highway 76.2 +- 3.8 -> 100.6
  +- 3.4. Patches that changed class: 320.6 +- 12.7 km2 (304.6 +- 11.5 km2 outside the fine-tune area).
- 4.8 change check (results/change_check.json): of 50 sampled reported changes (seed 42), final answers 24 yes /
  23 no / 3 unclear; real rate 0.5106 (95% Wilson 0.3724-0.6472). Rough scale-up: about 163.1 km2 real
  (119.0-206.8) of the 319.488 km2 reported. Claude alone before review: 21/22/7. User changed 6 answers.
- ONNX export (5.1, results/onnx_check.json): largest PyTorch-vs-ONNX logit difference on 20 Indian test patches
  7.15e-06 (limit 1e-4), passed.
- Showcase (5.2a, results/showcase.json; ONNX seed 42, RAW model output, change only checked for Ahmedabad in 4.8):
  Ahmedabad 2112 patches, 780 changed class (319.488 km2), ONNX classes identical to 4.7 PyTorch seed 42 for all 2112
  patches in both years. Vadodara 992 patches, 390 changed (159.744 km2); Surat 992, 353 (144.5888 km2); Rajkot 992,
  322 (131.8912 km2). Clear scenes 2018/2026: Ahmedabad 13/16, Vadodara 12/16, Surat 12/17, Rajkot 9/18.
- API check (5.2b, results/api_check.json; Docker container on the laptop, real Planetary Computer downloads):
  Ahmedabad 10 x 10 km box: 2026 in 22.9 s, 2018 in 26.2 s (225 patches, 5 scenes, tile 42QZL); 3 x 3 km box 11.1 s
  (16 patches). 20 x 22 km box and year 2021 both refused with a clear 422 message in 0.3 s.
