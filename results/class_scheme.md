# Step 8.2: class scheme for Indian land

Decision rule (written and committed before the quiz, see `configs/classes_india.yaml`): merge two classes only if they are confused in both directions in the 8.1 audit AND a blind judge cannot tell them apart on a random sample (right 70% or less). Right 80% or more keeps them separate; anything in between also keeps them separate. Accuracy of the model is never a reason to merge.

**Who judged:** Claude, blind (user's decision 2026-11-08, "just do everything"). Claude saw only the numbered sheets, never the key, when answering. The user has not judged this sample; their eyes may differ from Claude's, so the sheets are kept and the user can re-judge them (`--answers`).

## 1. Screen (from `results/error_audit.json`, fine-tune areas only)

Both classes need at least 5 labelled fine-tune-area patches, and the pair must be confused in both directions in one of the two 8.1 matrices.

| pair | matrix | A -> B | B -> A |
|---|---|---|---|
| AnnualCrop / Highway | loao | 9 | 1 |
| Highway / Industrial | loao | 1 | 4 |
| Industrial / Residential | eurosat | 7 | 49 |

Not tested (too few labelled patches, so the rule cannot merge them): Pasture 0, SeaLake 0, PermanentCrop 2, Forest 1, HerbaceousVegetation 1. So the rule says nothing about River versus SeaLake (SeaLake has no Indian label) or AnnualCrop versus PermanentCrop.

## 2. The blind quiz

10 random patches per class of each pair (seed 42, fine-tune areas only), shuffled, no labels shown. Numbered sheets: `reports/class_scheme/quiz_<pair>.png`; the key (which number is which patch) is `results/class_quiz_key.csv`; the answers are `results/class_quiz_answers.csv`.

| pair | right | judged | accuracy | decision |
|---|---|---|---|---|
| AnnualCrop_vs_Highway | 20 | 20 | 1.00 | keep separate (clear) |
| Highway_vs_Industrial | 19 | 20 | 0.95 | keep separate (clear) |
| Industrial_vs_Residential | 19 | 20 | 0.95 | keep separate (clear) |

### Caveats on the quiz

- **Area confound.** Where the sample patches come from (counts per area):

| pair | class | patches per area |
|---|---|---|
| AnnualCrop_vs_Highway | AnnualCrop | narmada_bharuch 7, ankleshwar_industrial 3 |
| AnnualCrop_vs_Highway | Highway | narmada_bharuch 9, ahmedabad_city 1 |
| Highway_vs_Industrial | Highway | narmada_bharuch 9, ahmedabad_city 1 |
| Highway_vs_Industrial | Industrial | ankleshwar_industrial 8, ahmedabad_city 2 |
| Industrial_vs_Residential | Industrial | ankleshwar_industrial 8, ahmedabad_city 2 |
| Industrial_vs_Residential | Residential | ahmedabad_city 8, ankleshwar_industrial 1, narmada_bharuch 1 |

  When the two classes come mostly from different areas, a judge can lean on the scene (brightness, haze, building style) instead of on the land use. So a high score here shows the classes look different in these patches, not that they would be told apart in a new city.
- **The judge is Claude, not the user.** The sheets are kept so the user can re-judge them.
- **Blindness is by procedure.** Claude answered from the numbered sheets only and saved the answers (committed) before opening the key, but it is the same assistant that built the quiz and earlier suggested labels for these patches (step 4.2).
- **Small sample.** 20 patches per pair (Highway has 11 in the fine-tune areas, so 10 of 11 were used). One answer more or fewer changes the accuracy by 5 points.
- **Untestable classes** (see the screen) are not covered.

## 3. Chosen scheme

**Keep the 10 EuroSAT classes** (`chosen_merges: {}`).

The 10-class numbers (3 seeds, Indian TEST areas, accuracy 0.4486 ± 0.0071 before, 0.6831 ± 0.0311 after fine-tuning, `results/india_after.json`) stay as they are. Accuracy on a merged class set would not be comparable to them, and any write-up that shows both must say so.

## 4. Mapping of every label source onto the chosen scheme

Each source class maps to exactly one scheme class or `ignore` (not used as a label). `could mean` = the EuroSAT classes it can stand for; it maps to a scheme class only if all of them land in the same one.

### eurosat: tier EuroSAT's own labels (Europe)

Identity mapping.

| source class | could mean | maps to |
|---|---|---|
| AnnualCrop | AnnualCrop | AnnualCrop |
| Forest | Forest | Forest |
| HerbaceousVegetation | HerbaceousVegetation | HerbaceousVegetation |
| Highway | Highway | Highway |
| Industrial | Industrial | Industrial |
| Pasture | Pasture | Pasture |
| PermanentCrop | PermanentCrop | PermanentCrop |
| Residential | Residential | Residential |
| River | River | River |
| SeaLake | SeaLake | SeaLake |

### hand_labels: tier 1 (human gold: the user's final_label in data/india/labels_reviewed.csv; Claude suggested, the user reviewed all)

Identity mapping. Used for evaluation. Never merged away silently: a merge relabels them and the 10-class numbers stay reported.

| source class | could mean | maps to |
|---|---|---|
| AnnualCrop | AnnualCrop | AnnualCrop |
| Forest | Forest | Forest |
| HerbaceousVegetation | HerbaceousVegetation | HerbaceousVegetation |
| Highway | Highway | Highway |
| Industrial | Industrial | Industrial |
| Pasture | Pasture | Pasture |
| PermanentCrop | PermanentCrop | PermanentCrop |
| Residential | Residential | Residential |
| River | River | River |
| SeaLake | SeaLake | SeaLake |

### worldcover: tier 2 (noisy reference)

Source: ESA WorldCover 10 m v200 (2021), class list read from the Planetary Computer item metadata (classification:classes) on 2026-11-08

Built-up cannot separate Residential from Industrial (and roads inside built-up areas look like Highway). Cropland cannot separate AnnualCrop from PermanentCrop. Shrubland and Grassland both fit HerbaceousVegetation and Pasture. Water cannot separate River from SeaLake. Under "keep 10" all of these are `ignore`; 8.4 decides whether to use them with a coarser label.

| source class | could mean | maps to |
|---|---|---|
| Tree cover (10) | Forest | Forest |
| Shrubland (20) | HerbaceousVegetation, Pasture | ignore |
| Grassland (30) | HerbaceousVegetation, Pasture | ignore |
| Cropland (40) | AnnualCrop, PermanentCrop | ignore |
| Built-up (50) | Residential, Industrial | ignore |
| Bare / sparse vegetation (60) | (none) | ignore |
| Snow and ice (70) | (none) | ignore |
| Permanent water bodies (80) | River, SeaLake | ignore |
| Herbaceous wetland (90) | (none) | ignore |
| Mangroves (95) | Forest | Forest |
| Moss and lichen (100) | (none) | ignore |

### dynamic_world: tier 2 (noisy reference)

Source: Dynamic World V1 label band, class table on the Earth Engine catalogue page (developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1), read 2026-11-08. CC-BY 4.0 with attribution. Needs a Google Earth Engine account to download: not used for data yet.

Same logic as WorldCover. flooded_vegetation and bare have no EuroSAT class.

| source class | could mean | maps to |
|---|---|---|
| water (0) | River, SeaLake | ignore |
| trees (1) | Forest | Forest |
| grass (2) | HerbaceousVegetation, Pasture | ignore |
| flooded_vegetation (3) | (none) | ignore |
| crops (4) | AnnualCrop, PermanentCrop | ignore |
| shrub_and_scrub (5) | HerbaceousVegetation, Pasture | ignore |
| built (6) | Residential, Industrial | ignore |
| bare (7) | (none) | ignore |
| snow_and_ice (8) | (none) | ignore |

### pseudo_labels: tier 3 (model-assisted; flagged in the data; training only)

A pseudo-label is a class the model predicted, so it is already one of the scheme's classes. Identity mapping; under a merge the predicted class is merged the same way.

| source class | could mean | maps to |
|---|---|---|
| AnnualCrop | AnnualCrop | AnnualCrop |
| Forest | Forest | Forest |
| HerbaceousVegetation | HerbaceousVegetation | HerbaceousVegetation |
| Highway | Highway | Highway |
| Industrial | Industrial | Industrial |
| Pasture | Pasture | Pasture |
| PermanentCrop | PermanentCrop | PermanentCrop |
| Residential | Residential | Residential |
| River | River | River |
| SeaLake | SeaLake | SeaLake |

## 5. What this means for the next steps

- Tier-2 maps (WorldCover, Dynamic World) cannot give a single EuroSAT class for Cropland/crops, Built-up/built, Water, or Grassland/Shrubland under the 10-class scheme, so those labels map to `ignore`. Step 8.4 must decide how to use them (for example with a coarser training label that is kept apart from the 10-class evaluation); this step does not.
- Hand labels (tier 1) stay in the 10 classes, so every earlier number remains valid.
- Step 8.1 listed 'the classes do not fit' as cause 1, including Residential versus Industrial. This quiz does not support merging those two (see the caveats above for how far to trust that). Because the two classes in the sample mostly come from different areas, it is weak evidence about telling them apart inside one scene; a same-area sample would test that, and the rule does not require it. Still open: the water naming (Narmada called SeaLake) and crops versus PermanentCrop, which the rule cannot test because SeaLake and PermanentCrop have too few Indian labels. More labels come in 8.4 to 8.7.

