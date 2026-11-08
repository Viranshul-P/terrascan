---
license: {license_id}
task_categories:
- image-classification
size_categories:
- n<1K
tags:
- remote-sensing
- satellite-imagery
- sentinel-2
- land-use
- eurosat
- india
pretty_name: TerraScan India (Gujarat) Sentinel-2 patches
---

# TerraScan India: Sentinel-2 land-use patches from Gujarat

{patches} small satellite image patches from 5 areas in Gujarat, India, each labelled with one of the
10 [EuroSAT](https://github.com/phelber/EuroSAT) land-use classes. Made for the TerraScan project to test how a
model trained on European images (EuroSAT) does on Indian land, and to fine-tune it.

This is a small, uneven test set, not a training set for new models. Read "Limitations" before using it.

## What is in it

- RGB PNG images, 64 x 64 pixels at 10 m per pixel (one patch covers 640 m x 640 m).
- Columns in `metadata.csv`: `file_name`, `label` (EuroSAT class name), `split`, `area`, `lat`, `lon`
  (patch centre, WGS84), `scene_id` (Sentinel-2 scene), `date` (scene date), `first_labelled_by` (see "How it was labelled").
- Splits are **by area**, so neighbouring patches (which look almost the same) never sit on both sides:
  - `train` = {n_train} patches from the fine-tune areas (used to fine-tune in TerraScan).
  - `test` = {n_test} patches from the test areas (only used to report scores).

### Patches per class

| Class | train | test | total |
|---|---|---|---|
{class_rows}

### Areas

Box = [west, south, east, north] in degrees. One clear scene per area.

| Area | Split | Box | Scene date | Scene | Patches |
|---|---|---|---|---|---|
{area_rows}

## Source and processing

- Imagery: Copernicus Sentinel-2 Level-2A, bands B04/B03/B02 (red, green, blue), read from
  [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) (collection `sentinel-2-l2a`).
  Dry season (January-February {years}), clearest scene per area by whole-scene cloud cover.
- The +1000 offset was removed for every scene with processing baseline 04.00 or higher (decided per scene).
- EuroSAT was made from Level-1C images (with haze), these are Level-2A (haze removed). To make the colours
  comparable, each colour was adjusted with a straight-line fit (gain and shift) found on three European summer
  scenes and matched to EuroSAT; then the EuroSAT stretch (raw values 0-2750 to 1-255) was applied. The fit used no
  Indian images. Code and fitted numbers: TerraScan repo, `src/imagery.py` and `results/imagery_calibration.json`.
- Each area was cut into a grid of non-overlapping 64 x 64 patches. Only a shuffled subset was looked at for labelling.

## How it was labelled

- Every patch was reviewed by the project owner, who made every final call on its label. {n_claude} patches had an
  initial suggestion that the owner kept, and {n_user} patches were labelled by the owner directly. Column
  `first_labelled_by` records which of the two it was (`claude` or `user`).
- Rule: the class covering most of the patch. Patches were **skipped** (and are not in this dataset) when they were
  hazy, mixed (no class clearly over half), or land that fits no EuroSAT class (bare plots, construction, mudflats,
  scrub). Tree-covered campuses and orchards were skipped rather than called Forest or PermanentCrop. Highway = a wide
  road or flyover clearly crossing the patch.

## Limitations

- Very uneven classes (see the table): some classes have only a few patches or none at all. Scores for those classes
  mean little.
- Only 5 areas in one state, one season, one date per area. Two areas share one scene, and two others share one date.
- Many Indian landscapes fit no EuroSAT class and were skipped, so this set is easier than "real" Indian land.
- All labels were reviewed by one person, with no second opinion. Labels at 10 m are a judgement call; some will be wrong.
- Colour matching to EuroSAT is approximate (fitted on 3 European scenes).
- EuroSAT images are JPEGs (lossy); these are PNGs (lossless). A small difference, not measured.

## Licence and credit

Labels and patches: {license_upper}. Contains modified Copernicus Sentinel data {years}.
