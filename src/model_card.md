---
license: {license_id}
library_name: onnx
pipeline_tag: image-classification
base_model: timm/efficientnet_b0.ra_in1k
datasets:
- {dataset_repo}
tags:
- remote-sensing
- satellite-imagery
- sentinel-2
- land-use
- eurosat
- domain-shift
- india
---

# TerraScan: EfficientNet-B0 for land use in Gujarat, India (Sentinel-2)

An [EfficientNet-B0](https://arxiv.org/abs/1905.11946) that sorts small Sentinel-2 satellite patches (64 x 64 px,
10 m per pixel, so 640 m x 640 m) into the 10 [EuroSAT](https://github.com/phelber/EuroSAT) land-use classes.
It was first trained on European images (EuroSAT), then fine-tuned on a small set of hand-checked Indian patches.
Part of the [TerraScan project](https://github.com/Viranshul-P/terrascan).

**Read "Limitations" before using it.** It is a portfolio / learning project, not a mapping product.
The Indian test set is tiny ({n_india_test} patches), and the model gets about {india_wrong_pct} of them wrong there (3-seed mean).

## Result in one table

Indian test = {n_india_test} patches from 2 areas the model never saw (Vadodara outskirts, Sanand farmland), from
[{dataset_repo}](https://huggingface.co/datasets/{dataset_repo}). Values are mean ± std over 3 training seeds
(42, 43, 44). Source: `results/india_after.json` in the repo.

| | Before fine-tuning (Europe only) | After fine-tuning |
|---|---|---|
| Indian test accuracy | {india_acc_before} | {india_acc_after} |
| Indian test macro-F1 | {india_f1_before} | {india_f1_after} |
| EuroSAT test accuracy ({n_eurosat_test} images) | {eurosat_acc_before} | {eurosat_acc_after} |

- Fine-tuning moved Indian test accuracy by **{india_gain_points} percentage points**. The two ranges do not overlap.
- EuroSAT test accuracy went down by {eurosat_drop_points} percentage points. That is small, but the ranges do not
  overlap either, so the drop is probably real (3 seeds only).
- The uploaded file is **seed 42 only**. Its own Indian test accuracy is {india_acc_seed} after fine-tuning (95% bootstrap
  range {india_acc_seed_range}, which is wide because there are only {n_india_test} patches).
  Use the 3-seed numbers above for "how good is this recipe"; seed 42 is one draw from that spread.
- Macro-F1 on the Indian test set is only averaged over classes that appear there (River and SeaLake have 0 test patches).

### Seed 42, per class (Indian test, after fine-tuning)

Classes with 1 to 5 test patches give very unreliable F1 scores.

| Class | Test patches | Predicted as this class | F1 |
|---|---|---|---|
{per_class_rows}

## What the model is

- EfficientNet-B0 (4,020,358 parameters), start weights `efficientnet_b0.ra_in1k` from
  [timm](https://huggingface.co/timm/efficientnet_b0.ra_in1k) (ImageNet-1k, Apache-2.0), last layer replaced by 10 outputs.
- Input: RGB patch scaled up from 64 x 64 to **128 x 128** (bilinear), values 0-1, then ImageNet mean/std. Output: 10 class scores.
- Classes (in this order): AnnualCrop, Forest, HerbaceousVegetation, Highway, Industrial, Pasture, PermanentCrop,
  Residential, River, SeaLake (`onnx_info.json` lists them too).
- Files: `model.onnx` (CPU inference with onnxruntime, no PyTorch), `best.pt` (PyTorch state dict; load it with
  `timm.create_model("efficientnet_b0", pretrained=False, num_classes=10)`), `config.yaml`, `onnx_info.json`.
- The ONNX file matches the PyTorch weights: largest difference in the scores on 20 Indian test patches is
  {onnx_diff} (`results/onnx_check.json`).
- Speed on one CPU thread, batch 1, model only (no image reading), EuroSAT-trained version of this network on the
  training laptop: {cpu_ms} ms per patch (`results/efficientnet_b0.json`). The fine-tuned model has the same size.

## How it was trained

1. **EuroSAT** (RGB version, 27,000 images, 10 classes), split 70 / 15 / 15 once and reused by every model.
   AdamW, learning rate 0.001, weight decay 0.05, cosine schedule, label smoothing 0.1, 50 epochs, batch size 64,
   flips and 90-degree rotations plus a little colour jitter. The epoch with the lowest validation loss is kept.
   The test split was used for final reporting only.
2. **Fine-tuning on India**: {n_finetune} labelled patches from 3 areas (Ahmedabad city, Narmada at Bharuch, Ankleshwar
   industrial). All layers, learning rate {ft_lr}, {ft_epochs} epochs, batch size {ft_batch}. Every epoch also mixes in
   {eurosat_per_epoch} fresh EuroSAT training images, because an Indian-only first try made the model forget Europe
   (EuroSAT validation accuracy fell to between {nomix_low} and {nomix_high}; kept in the repo as evidence). Nothing was tuned on the Indian
   test areas; there is no Indian validation set, so the last epoch is kept.

The Indian split is **by area**, so look-alike neighbouring patches never sit on both sides.

## How to use it

The model expects images that look like EuroSAT, which was made from Sentinel-2 Level-1C. Level-2A scenes
(from Microsoft Planetary Computer) need the colour adjustment in
[`src/imagery.py`](https://github.com/Viranshul-P/terrascan/blob/main/src/imagery.py)
(fitted numbers: `results/imagery_calibration.json`) and the EuroSAT stretch before they go in.
Skip this and the colours are off, and so are the predictions.

```python
# pip install onnxruntime numpy huggingface_hub   (and clone the TerraScan repo for src/onnx_predict.py)
import numpy as np
from huggingface_hub import hf_hub_download
from src.onnx_predict import load_model, predict

onnx_path = hf_hub_download("{repo_id}", "model.onnx")
info_path = hf_hub_download("{repo_id}", "onnx_info.json")
session, info = load_model(onnx_path, info_path)

patches = np.zeros((1, 64, 64, 3), dtype=np.uint8)   # replace with real uint8 RGB patches, shape (N, 64, 64, 3)
class_numbers, confidence = predict(session, info, patches)
print(info["classes"][class_numbers[0]], confidence[0])
```

## Change study (Ahmedabad, 2018 vs 2026)

The model was run on {n_change_patches} patches (a box of about 30 x 28 km around Ahmedabad) in Dec-Feb 2017/18 and
Dec-Feb 2025/26. For the map from this model (seed 42) it reported **{reported_changed_km2} km2** where the predicted class
changed. To check, 50 random "changed" patches were looked at as before/after pairs: **{real_rate} of the judged pairs
showed a real change** (95% range {real_rate_range}), so the likely real change is about **{real_km2} km2**
(95% range {real_km2_range}). Roughly half of what the model calls change is the model changing its mind, not the land
(`results/change_check.json`). The judging was done by Claude first, blind to the model's classes, then reviewed by the
project owner, who changed {n_changed_by_user} of 50 answers.

## Limitations

- **Small, uneven Indian test set.** {n_india_test} patches, {n_test_classes} classes present, some with 1 to 5 patches. Only 3 seeds.
  Accuracy has a wide uncertainty range; do not compare it to other papers' numbers.
- **Narrow data.** 5 areas in one state (Gujarat), dry season only (January-February 2026), one scene per area.
  It has not been tested on other Indian regions, monsoon scenes, or other countries.
- **Patches that fit no class were left out** of the Indian data (bare plots, construction, mudflats, scrub), so real
  performance on "any Indian land" is lower than the test number suggests.
- **Fine-tuned on very few patches.** Some classes have 0 or 1 Indian training patch (Pasture {train_pasture}, Forest {train_forest},
  HerbaceousVegetation {train_herb}), so the model has barely seen them in India.
- **Slightly worse in Europe** after fine-tuning (see the table).
- **Colour pipeline matters.** The Level-2A to Level-1C colour fit used only 3 European summer scenes. India
  in January still looked a bit brighter and bluer than EuroSAT after it (`results/imagery_check.json`).
- **Labels are a judgement call.** One AI suggested them, one human reviewed all of them, no second human.
  Details are in the dataset card.
- **Change maps over-report.** About half of the squares the model marks as changed show no real change.
- RGB only, one 10 m patch at a time, no time series, no cloud mask beyond picking clear scenes.
- Not for decisions about land, property, safety or policy.

## Who did what

The project owner chose the project, the areas and the settings, and reviewed every Indian label and the change
check. Claude (an AI assistant) wrote the code, suggested the first Indian labels and the first answers of the change
check, and drafted this card. Every number in this card is filled in by code from the result files of the repo, not typed by hand.

## Credits and licence

Model files and this card: {license_upper}. Start weights: timm `efficientnet_b0.ra_in1k`, Apache-2.0 (ImageNet-1k
training data). EuroSAT: MIT licence, Helber et al. (2019), *EuroSAT: A Novel Dataset and Deep Learning Benchmark for
Land Use and Land Cover Classification*. Contains modified Copernicus Sentinel data 2017, 2018, 2025 and 2026.
