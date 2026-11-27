# Step 8.3b: spectral bands, comparison and decision

Every number here was computed by `src/bands_train.py` and `src/bands_report.py` from `models/bands_<run>/seed*/metrics.json` and `results/bands_runs/*.csv` (summary: `results/bands_comparison.json`).

**What was measured.** EuroSAT: the 15 % val split of EuroSAT_MS (the test split is NOT used). India: leave-one-area-out (LOAO) over the 3 Indian fine-tune areas (ahmedabad_city, narmada_bharuch, ankleshwar_industrial), 149 patches pooled; for each held-out area the model is fine-tuned on the other two (4.4 recipe unchanged) and scored on the held-out one. The 2 Indian TEST areas were not used for anything here (they were already scored in 4.3/4.4). Mean ± sample std over seeds [42, 43, 44]. The Indian labels are the hand labels (tier 1).

## Decision

Arm A (reference rgb: India LOAO 0.6734 ± 0.0393, EuroSAT val 0.9923 ± 0.0008). rgb_nir: no clear gain (India LOAO calibrated 0.6443 ± 0.0507, uncalibrated 0.6376 ± 0.0374; EuroSAT val 0.9940 ± 0.0009); rgb_nir_swir: no clear gain (India LOAO calibrated 0.6868 ± 0.0410, uncalibrated 0.6756 ± 0.0169; EuroSAT val 0.9934 ± 0.0010); rgb_indices: no clear gain (India LOAO calibrated 0.6622 ± 0.0405, uncalibrated 0.6421 ± 0.0672; EuroSAT val 0.9926 ± 0.0007); all_bands: fragile (India LOAO calibrated 0.7494 ± 0.0140, uncalibrated 0.7114 ± 0.0355; EuroSAT val 0.9939 ± 0.0009). Decision for arm A: **rgb** stays.

Arm B (reference sat_rgb: India LOAO 0.5749 ± 0.0476, EuroSAT val 0.9866 ± 0.0006). sat_all: keep (India LOAO calibrated 0.6868 ± 0.0563, uncalibrated 0.7047 ± 0.0308; EuroSAT val 0.9919 ± 0.0014). Decision for arm B: **sat_all** is kept.

Rule (from `configs/bands_compare.yaml`, committed before any run): a variant is better than RGB only if its mean beats RGB's by more than both stds added together, with calibrated AND uncalibrated extra bands, and EuroSAT val not clearly worse; otherwise RGB stays.

## Table

| run | arm | channels | EuroSAT val acc | EuroSAT val macro-F1 | India LOAO acc (calibrated) | India LOAO acc (uncalibrated) | India LOAO macro-F1 (calibrated) | verdict |
|---|---|---|---|---|---|---|---|---|
| rgb | A | 3 | 0.9923 ± 0.0008 | 0.9921 ± 0.0009 | 0.6734 ± 0.0393 | same (RGB only) | 0.3975 ± 0.0229 | reference |
| rgb_nir | A | 4 | 0.9940 ± 0.0009 | 0.9937 ± 0.0009 | 0.6443 ± 0.0507 | 0.6376 ± 0.0374 | 0.4780 ± 0.0960 | no clear gain |
| rgb_nir_swir | A | 6 | 0.9934 ± 0.0010 | 0.9932 ± 0.0010 | 0.6868 ± 0.0410 | 0.6756 ± 0.0169 | 0.4000 ± 0.0342 | no clear gain |
| rgb_indices | A | 6 | 0.9926 ± 0.0007 | 0.9924 ± 0.0008 | 0.6622 ± 0.0405 | 0.6421 ± 0.0672 | 0.4032 ± 0.0833 | no clear gain |
| all_bands | A | 13 | 0.9939 ± 0.0009 | 0.9936 ± 0.0011 | 0.7494 ± 0.0140 | 0.7114 ± 0.0355 | 0.4974 ± 0.1083 | fragile |
| sat_rgb | B | 3 | 0.9866 ± 0.0006 | 0.9862 ± 0.0006 | 0.5749 ± 0.0476 | same (RGB only) | 0.3477 ± 0.0632 | reference |
| sat_all | B | 13 | 0.9919 ± 0.0014 | 0.9916 ± 0.0015 | 0.6868 ± 0.0563 | 0.7047 ± 0.0308 | 0.4394 ± 0.0646 | keep |

## Per seed

| run | calibration | seed 42 | seed 43 | seed 44 |
|---|---|---|---|---|
| rgb | EuroSAT val | 0.9921 | 0.9931 | 0.9916 |
| rgb | India LOAO, calibrated | 0.7181 | 0.6443 | 0.6577 |
| rgb_nir | EuroSAT val | 0.9941 | 0.9948 | 0.9931 |
| rgb_nir | India LOAO, calibrated | 0.5973 | 0.6980 | 0.6376 |
| rgb_nir | India LOAO, uncalibrated | 0.6040 | 0.6779 | 0.6309 |
| rgb_nir_swir | EuroSAT val | 0.9943 | 0.9936 | 0.9923 |
| rgb_nir_swir | India LOAO, calibrated | 0.7315 | 0.6510 | 0.6779 |
| rgb_nir_swir | India LOAO, uncalibrated | 0.6913 | 0.6779 | 0.6577 |
| rgb_indices | EuroSAT val | 0.9921 | 0.9923 | 0.9933 |
| rgb_indices | India LOAO, calibrated | 0.7047 | 0.6242 | 0.6577 |
| rgb_indices | India LOAO, uncalibrated | 0.7181 | 0.5906 | 0.6174 |
| all_bands | EuroSAT val | 0.9928 | 0.9943 | 0.9946 |
| all_bands | India LOAO, calibrated | 0.7450 | 0.7383 | 0.7651 |
| all_bands | India LOAO, uncalibrated | 0.6980 | 0.7517 | 0.6846 |
| sat_rgb | EuroSAT val | 0.9869 | 0.9859 | 0.9869 |
| sat_rgb | India LOAO, calibrated | 0.6174 | 0.5839 | 0.5235 |
| sat_all | EuroSAT val | 0.9923 | 0.9931 | 0.9904 |
| sat_all | India LOAO, calibrated | 0.6577 | 0.6510 | 0.7517 |
| sat_all | India LOAO, uncalibrated | 0.7315 | 0.6711 | 0.7114 |

## Per held-out area (calibrated), accuracy mean ± std

| run | ahmedabad_city | ankleshwar_industrial | narmada_bharuch |
|---|---|---|---|
| rgb | 0.805 ± 0.010 | 0.690 ± 0.034 | 0.543 ± 0.092 |
| rgb_nir | 0.787 ± 0.055 | 0.621 ± 0.034 | 0.522 ± 0.083 |
| rgb_nir_swir | 0.782 ± 0.020 | 0.632 ± 0.020 | 0.624 ± 0.089 |
| rgb_indices | 0.793 ± 0.062 | 0.609 ± 0.020 | 0.565 ± 0.141 |
| all_bands | 0.828 ± 0.046 | 0.667 ± 0.020 | 0.715 ± 0.009 |
| sat_rgb | 0.764 ± 0.026 | 0.655 ± 0.060 | 0.360 ± 0.083 |
| sat_all | 0.839 ± 0.070 | 0.552 ± 0.091 | 0.608 ± 0.083 |

## Reference numbers from earlier steps (different pipeline, not a like-for-like row)

- 2.4 EfficientNet-B0 on the RGB JPEGs (with colour jitter): EuroSAT val 0.9897 ± 0.0014 (from models/efficientnet_b0/seed*/metrics.json).
- 8.1 LOAO with the 2.4 model on the RGB PNG patches: 0.6555 ± 0.0169 (results/error_audit.json, accuracy.loao).

## Limits

- 149 Indian patches from 3 areas, 3 seeds: the std is training noise only, and Narmada (most River and crop labels) drives most errors, as in 8.1. A gain or loss smaller than the noise cannot be seen.
- Indian scenes are one dry-season day per area; extra bands were calibrated on 3 European summer scenes (shaky: results/bands_calibration.json) and run uncalibrated as a check. In the uncalibrated run RGB keeps its 4.1 calibration, so indices mix calibrated red/green with uncalibrated NIR/SWIR.
- B10 (cirrus) is a constant on both sides, so `all_bands` and `sat_all` effectively have 12 bands.
- No colour jitter in any run here, so the retrained RGB row differs from the 2.4 model.
- LOAO accuracy on a few patches is rough; macro-F1 is rougher. The decision uses accuracy only.
