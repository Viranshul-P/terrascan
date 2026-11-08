## 5. Ranked likely causes

Written by Claude from the tables above; every number in it is filled in by code from `results/error_audit.json`. "Evidence" says what the files show; "Not tested" says what would still have to be checked. These are causes of errors on the three fine-tune areas only (the TEST areas are not used). No fix was tried in this step.

### What did and did not reproduce from the live site

- **"Sabarmati predicted as crop": mostly not reproduced.** In the live Ahmedabad map, {water_squares} squares are at least 20% water by ESA WorldCover (tier 2); the live model calls {water_river} of them River and {water_crop} AnnualCrop. Of the two user-labelled Sabarmati patches (both show the river, bridges and city on both banks), the held-out (LOAO, seed 42) model and the EuroSAT-only model (seed 42) say: `ahmedabad_city_r0256_c0768.png` LOAO {sab1_loao}, EuroSAT-only {sab1_e}; `ahmedabad_city_r0576_c0768.png` LOAO {sab2_loao}, EuroSAT-only {sab2_e}. So the error exists for some river patches, but it is not what the live map does along most of the river. If you saw it somewhere specific, send me the place (the square's row/column or a screenshot) and I will look it up.
- **"Residential predicted as industrial": plausible, not measured by this check.** Of the {built_squares} live squares that are at least 50% built-up by WorldCover, the live model says Residential {built_res}, Industrial {built_ind}, Highway {built_hwy}. WorldCover cannot say which squares are really industrial, so these counts alone do not prove errors; the labelled fine-tune patches do show the confusion, in both directions (below).
- **"City areas predicted as other classes": barely.** Only {built_other} of those {built_squares} built-up squares are called something other than Residential, Industrial or Highway.

### Ranked causes

**1. The EuroSAT classes do not fit what Indian scenes contain at 10 m. (Strongest evidence.)**
- *Wide muddy rivers are called SeaLake.* The user labelled River {river_total} times (patch × seed rows); both models get only {river_e_right} (EuroSAT-only) and {river_l_right} (leave-one-area-out) right, and {river_to_sealake} of them are called SeaLake by both. Pictures of the Narmada patches (`narmada_bharuch_r0832_c0320.png`, `narmada_bharuch_r0704_c0960.png`) show a very wide, brown-grey estuary, not the blue water EuroSAT's SeaLake shows (my reading of the pictures). We have {sealake_labels} SeaLake labels, so River versus SeaLake is a naming question as much as a model one.
- *Residential and Industrial are confused in both directions.* EuroSAT-only: Residential to Industrial {res_to_ind_e}, Industrial to Residential {ind_to_res_e}. After leave-one-area-out fine-tuning: {res_to_ind_l} and {ind_to_res_l}. Pictures (`ahmedabad_city_r0832_c0000.png`, `ankleshwar_industrial_r0320_c0448.png`) show dense blocks that I could not label with confidence myself at this size.
- *A 640 m patch often holds several things* (river plus city on the Sabarmati patches), but gets one label.
- Not tested: whether merging classes helps (that is 8.2, with its own rule), and whether you can tell Residential from Industrial on a random sample.

**2. Indian crop fields look unlike EuroSAT's AnnualCrop. (Strong evidence for the pattern, the reason is a guess.)**
- EuroSAT-only gets {crop_e_right} of {crop_n} AnnualCrop patch × seed rows right; {crop_e_to_perm} are called PermanentCrop and {crop_e_to_pasture} Pasture. Leave-one-area-out fine-tuning gets {crop_l_right} of {crop_n} right, from {crop_train_patches} crop patches in training (depending on the held-out area), so local examples fix about half of it quickly.
- Colour: same-class mean red is {crop_india_red} for Indian AnnualCrop patches against {crop_eurosat_red} for a seeded EuroSAT sample, darker by {crop_gap_std} times EuroSAT's overall red standard deviation. Not tested: why. My guess from the pictures (dark green and brown tiled fields) is that these are winter-season crops in January to February; EuroSAT's capture dates are not known to me, so this stays a guess.

**3. Few and uneven local labels. (Strong evidence, and it limits every conclusion here.)**
- Fine-tune-area labels: AnnualCrop {n_crop}, Residential {n_res}, Industrial {n_ind}, Highway {n_hwy}, River {n_river}, PermanentCrop {n_perm}, Forest {n_forest}, HerbaceousVegetation {n_herb}, Pasture {n_pasture}, SeaLake {n_sealake}.
- Leave-one-area-out accuracy swings by area: {loao_ahm} for ahmedabad_city, {loao_ank} for ankleshwar_industrial, {loao_nar} for narmada_bharuch. Narmada loses most because the other two areas hold only {n_crop_ank} crop patches (`ankleshwar_industrial`) and {n_river_ahm} River labels (`ahmedabad_city`), so a class with so few local examples is hard to fix by fine-tuning. Rare-class rows in the matrices (3 to 6 patch × seed rows) mean very little.
- Overall: EuroSAT-only {eurosat_acc} ± {eurosat_std}, leave-one-area-out {loao_acc} ± {loao_std} (mean ± std over seeds 42/43/44; the three seeds share the same patches, so this shows training noise only).

**4. Label and mixed-patch problems. (Weak evidence, one example.)**
- `narmada_bharuch_r0512_c0640.png` is labelled AnnualCrop but, to my eye, shows a town with a diagonal road (the held-out seed-42 model says {r0512_pred} at {r0512_conf} confidence). I did not change any label; please look at this patch yourself. Not measured: how many other labels are in doubt, since you reviewed every patch once and no second opinion exists.

**5. A global brightness or scaling error. (Unlikely to be the main cause.)**
- Overall the Indian fine-tune-area patches are only {gap_red}, {gap_green} and {gap_blue} EuroSAT standard deviations (red, green, blue) off EuroSAT's mean. The per-class gaps point in opposite directions (crop darker, Residential brighter: mean red {res_india_red} against {res_eurosat_red}), so one colour correction cannot explain them. Areas differ from each other (mean red {bright_ahm} in ahmedabad_city, {bright_nar} in narmada_bharuch), so brightness varies by place and scene, and one pipeline-wide correction would not fit all of them.
- Not tested: re-fitting the 4.1 calibration on Indian scenes, and the small JPEG-versus-PNG difference noted in step 4.3.

### What this means for the next steps

Causes 1 and 3 point at 8.2 (class scheme, using this evidence and its written rule) and 8.4 to 8.7 (more labels, including other cities). Cause 2 suggests more Indian crop examples help most per label, and 8.3 (more spectral bands) is where information beyond RGB could help tell crops, water and built-up apart. Cause 5 does not call for more calibration work.
