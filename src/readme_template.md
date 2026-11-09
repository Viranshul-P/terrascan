# TerraScan: does a land-use model trained on European satellite images work on Indian land?

A small research-style project on **domain shift** in satellite image classification. Models that read 64 × 64 px
Sentinel-2 patches (10 m per pixel, so 640 m × 640 m) were trained on the European EuroSAT dataset, then tested on
hand-labelled patches from Gujarat, India. A map website and a change study of Ahmedabad (2018 vs 2026) were built on top.

**Status: finished as a portfolio / learning project (wrapped up 2026-11-09). It is not a mapping product.** Read
[Known limitations](#known-limitations) before trusting any map.

- Live site: {live_site}
- Model: https://huggingface.co/{model_repo}
- Indian dataset: https://huggingface.co/datasets/{dataset_repo}

## The question and the short answer

**Question:** if a land-use classifier is very accurate on European images, how accurate is it on Indian land, and how much
does a small set of local labels help?

**Short answer** (EfficientNet-B0, mean ± std over training seeds 42, 43, 44; sources in the tables below):

- On EuroSAT's own test images: **{eurosat_acc_before}** accuracy (`results/india_after.json`; the same model family is in the EuroSAT table below).
- On Indian test patches it never saw: **{india_acc_before}** (about {india_before_pct}).
- After fine-tuning on {n_finetune} Indian patches (mixed with some EuroSAT images): **{india_acc_after}**
  (about {india_after_pct}; `results/india_after.json`). The ranges do not overlap, so the gain of
  {india_gain_points} percentage points is probably real, but it is still wrong on roughly {india_wrong_pct} of the Indian test patches.
- The Indian test set is **tiny: {n_india_test} patches** from two areas ({test_areas}), so every Indian number has a wide
  uncertainty range. These two areas were scored in the study steps (before and after fine-tuning); settings were chosen on
  the fine-tune areas and EuroSAT validation images, not on them (this rests on the project log; the code and results
  were committed together, so git history cannot prove the order).
- Change study, Ahmedabad 2018 vs 2026: the model reported **{reported_changed_km2} km²** of changed land use, but a check of
  {change_n_pairs} random "changed" squares found only **{real_rate}** were real change (95% range {real_rate_range}), so
  the likely real change is about **{real_km2} km²** (95% range {real_km2_range}). Source: `results/change_check.json`.

## What was done

1. **EuroSAT.** 27,000 RGB images (64 × 64 px, 10 classes), split 70 / 15 / 15 once and reused by every model
   (`data/splits/`). Five models, one shared training recipe (AdamW, cosine learning rate, label smoothing 0.1,
   50 epochs, keep the lowest-validation-loss epoch), 3 seeds each: a small CNN, ResNet-18 and EfficientNet-B0 started
   from ImageNet, and ResNet-18 started from Sentinel-2 satellite weights (torchgeo).
2. **Indian data.** Sentinel-2 L2A scenes (Microsoft Planetary Computer) from five ~10 km areas in Gujarat, Jan-Feb 2026,
   cut into the same 64 × 64 patches. EuroSAT was made from Level-1C images and these are Level-2A, so colours were
   matched to EuroSAT with a straight-line fit made on three **European** scenes only (`results/imagery_calibration.json`).
   {n_reviewed} patches were looked at, {n_labelled} got a label and {n_skipped} were skipped (hazy, mixed, or land that fits no
   EuroSAT class). The split is **by area**: fine-tune areas ({ft_areas}) and test areas ({test_areas}).
3. **Fine-tuning.** Start from the EuroSAT model, train all layers for {ft_epochs} epochs (learning rate {ft_lr}, batch {ft_batch}) on the
   fine-tune areas, mixed with {eurosat_per_epoch} fresh EuroSAT images per epoch. No tuning on the test areas; the last epoch is kept.
4. **Change study.** Median composites of the clear scenes of one tile for Dec-Feb 2017/18 and Dec-Feb 2025/26, the
   fine-tuned model on {n_change_patches} patches, then a before/after check of a random sample of the "changed" squares.
5. **Website, API and model files.** React + MapLibre site, a small FastAPI server, ONNX export, model on Hugging Face.

## Results

### EuroSAT (Europe, the "easy" case)

Test split = 15% of EuroSAT (4,050 images), used for final reporting only. Mean ± std over seeds 42/43/44 (sample std);
SmallCNN v1 is one seed. Source: `results/<model>.json` made by `src/evaluate.py`; full table in `results/comparison.md`.
CPU ms = model only, batch 1, 1 thread, on the training laptop.

| Model | Seeds | Input | Params | Test accuracy | Test macro-F1 | CPU ms/image |
|---|---|---|---|---|---|---|
{eurosat_table}

The multi-seed models score between {eurosat_low} and {eurosat_high}. The highest mean is {eurosat_best} ({eurosat_best_acc}); the
ranges of {eurosat_same_as_best} overlap with it, so those are **about the same** and no model is claimed to beat another.
This is **consistent with published results**: the EuroSAT authors report {published_acc} overall accuracy
([their page]({published_url}), checked {published_checked}). It is not a comparison against the state of the art,
and the splits and training details differ from the paper.

Confusion matrix of EfficientNet-B0, seed 42 (the model that was later fine-tuned for India; picked by validation accuracy, not test):

![EfficientNet-B0 confusion matrix](reports/figures/confusion_efficientnet_b0.png)

Where it looks (Grad-CAM, 8 correct and 8 wrong test predictions picked at random, seed 42; `src/gradcam.py`):

![Grad-CAM examples](reports/figures/gradcam.png)

### Europe to India (domain shift)

Indian test = {n_india_test} patches from {test_areas}. Mean ± std over 3 seeds. Source: `results/india_after.json`.

| | Before fine-tuning (Europe only) | After fine-tuning |
|---|---|---|
| Indian test accuracy | {india_acc_before} | {india_acc_after} |
| Indian test macro-F1 (classes present only) | {india_f1_before} | {india_f1_after} |
| EuroSAT test accuracy ({n_eurosat_test} images) | {eurosat_acc_before} | {eurosat_acc_after} |

- Indian accuracy rose by {india_gain_points} percentage points; EuroSAT accuracy fell by {eurosat_drop_points} points (small, but the ranges do not overlap).
- A first try that fine-tuned on Indian patches only made the model **forget Europe**: EuroSAT validation accuracy fell to
  between {nomix_low} and {nomix_high} (`models/efficientnet_b0_india_nomix/`). Mixing EuroSAT images into every epoch fixed it.
- Patches that fit no EuroSAT class were left out of the Indian data, so the test set is easier than "any Indian land".

### Change in Ahmedabad, 2018 to 2026

![Land use 2018](reports/figures/change_map_2018.png)
![Land use 2026](reports/figures/change_map_2026.png)

The maps over-report change: only {real_rate} of the sampled "changed" squares showed a real change; the rest were the model changing its mind, not the land.
Numbers are in the short answer above (`results/change_check.json`).
The check was done by eye on before/after image pairs (one reviewer; {n_changed_by_user} of the {change_n_pairs} answers were changed on review), so it is a judgement, not ground truth.

### What went wrong on the way

- With early stopping at patience 15, EfficientNet-B0 stopped {p15_stopped} of {p15_total} seeds early (after {p15_epochs} epochs; best epochs {p15_best}) while the learning
  rate was still high, so the final recipe always trains 50 epochs and keeps the best epoch (`models/efficientnet_b0_patience15/*/metrics.json`).
- With plain Level-2A colours, a European control scene came out much less blue than EuroSAT. The colour fit above fixed that
  before any Indian number was measured (`results/imagery_check.json`).
- Fine-tuning on Indian patches only caused forgetting (above).

## Known limitations

These are things seen on the live site and confirmed (or not) by an error audit of the fine-tune areas
(`results/error_audit.md`, {n_audit_patches} labelled patches, models that never saw the held-out area).

- **The Sabarmati river is sometimes predicted as crop.** It was seen on the live Ahmedabad map. The audit could reproduce it only
  rarely: of the {water_squares} map squares that ESA WorldCover marks as water (at least {min_water} of the square), {water_as_river} came out as
  River and {water_as_crop} as AnnualCrop; the rest were other classes. The river is narrower than a 640 m square, so the squares along it mix water with bridges and
  buildings (looked at by eye in the audit).
- **Residential areas are sometimes predicted as industrial, and the other way round.** On the live map, {built_as_industrial} of
  {built_squares} squares that WorldCover marks as built-up were called Industrial ({built_industrial_pct}). In the audit, {res_to_ind} of {res_total} Residential
  patch-predictions became Industrial and {ind_to_res} of {ind_total} Industrial ones became Residential (patch-predictions = patches × 3 seeds).
- **Wide muddy rivers are called lakes.** Most River labels are on the Narmada at Bharuch, and they are usually predicted as SeaLake: only {river_right} of {river_total} River
  patch-predictions were right, {river_to_sealake} were SeaLake. There are no SeaLake labels in the Indian data at all.
- **Crops look different.** An EuroSAT-only model got {crop_right_base} of {crop_total} Indian AnnualCrop patch-predictions right; fine-tuned models that
  never saw the area got {crop_right_loao}.

**Why.** These mistakes come from training on **European** data and a **small Indian dataset**. The audit ranks the causes
as: (1) EuroSAT's 10 classes do not fit Indian land well (wide muddy rivers, residential vs industrial, mixed patches),
(2) Indian crops look unlike EuroSAT's, (3) few and uneven local labels. These causes are the audit's evidence-based ranking,
not proof; the "winter crops" explanation for the crop colour gap is a guess and was not tested.

More limits:

- **Tiny Indian test set** ({n_india_test} patches, two areas), 3 seeds, wide uncertainty. Do not compare it with other papers' numbers.
- **Narrow data:** 5 areas in one state, dry season, one scene per area. Nothing is known about other regions, the monsoon or other countries.
- **Labels are a judgement call.** Of the {n_labelled} Indian labels, an AI assistant suggested the first label for {n_first_ai} patches (blind to the model's
  predictions) and {n_first_owner} were labelled by the project owner; the owner reviewed every patch and made every final call. One reviewer, no second opinion.
- **Change maps over-report** (see above), and the check itself was done by looking at image pairs, which is also a judgement.
- **Colour matching is approximate** (fitted on 3 European summer scenes).
- RGB only, one patch at a time, no time series and no cloud mask beyond choosing clear scenes.
- Not for decisions about land, property, safety or policy.

## What was not done

The plan had a second phase meant to improve Indian accuracy: more spectral bands, large noisy label sets from public land-cover
maps, a satellite foundation model and a multi-city evaluation. The project was wrapped up before it. Only the error audit above, a class-scheme check
(`results/class_scheme.md`: no evidence for merging classes, so the 10 EuroSAT classes were kept) and the data code for extra bands
were finished. A band comparison was started but not completed, so **no result from it is reported anywhere**. There are no multi-city results,
no label-efficiency curves, and no GIF of the Compare slider.

## Run it yourself

Python 3.12. On the training laptop (NVIDIA GPU) install the CUDA build of PyTorch first, then the pinned packages:

```
python -m venv .venv
.venv\Scripts\activate
pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt
python scripts/download_eurosat.py          # EuroSAT RGB from Zenodo (MD5 checked)
python scripts/make_splits.py               # the fixed 70/15/15 split (already committed in data/splits/)
python scripts/compute_stats.py
python -m src.train --config configs/efficientnet_b0.yaml --seed 42 --fast-dev-run   # always first
python -m src.train --config configs/efficientnet_b0.yaml --seed 42
python -m src.evaluate --config configs/evaluate.yaml                                 # test split, results/<model>.json
python scripts/comparison_table.py                                                    # results/comparison.md
python scripts/india_patches.py --config configs/india.yaml                           # needs internet (Planetary Computer)
python -m src.india_eval --config configs/india_eval.yaml                             # before fine-tuning
python -m src.india_finetune --config configs/india_finetune.yaml                     # after fine-tuning
python -m src.readme --config configs/readme.yaml                                     # rebuild this README from results/
pytest && ruff check .
```

The Indian steps need `data/india/` (the patches and `labels_reviewed.csv`), which is git-ignored; the patches come from `scripts/india_patches.py` and the final labels
are published in the Hugging Face dataset (`metadata.csv`). These commands are taken from the scripts' own usage notes; the whole chain was not re-run on a clean machine for this README. The website is in `web/` (`npm ci`, `npm run dev`, `npm test`) and the API in `api/`.
Training runs write `models/<run_name>/seed<N>/` (weights, exact config, `metrics.json`); weights and imagery are git-ignored.
This README is generated: change `src/readme_template.md` and run `python -m src.readme`, not `README.md`.

## Licence and credits

Code: MIT (see `LICENSE`). Model files: Apache-2.0 (start weights: timm `efficientnet_b0.ra_in1k`, Apache-2.0). Indian dataset: CC BY 4.0.
EuroSAT: MIT licence, Helber et al. (2019), *EuroSAT: A Novel Dataset and Deep Learning Benchmark for Land Use and Land Cover Classification*.
Contains modified Copernicus Sentinel data 2017, 2018, 2025 and 2026. Land-cover reference used in the audit only: ESA WorldCover 2021.
