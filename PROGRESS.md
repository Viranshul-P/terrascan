# TerraScan — Progress

Claude updates this at the end of every step. Keep entries short.

## Current step
3.1

## Status
waiting on you
<!-- one of: not started | in progress | waiting on you | done -->

## Waiting on you
Step 3.1 write-up. Open `reports/figures/confused_pairs.png` (and the table in `results/confused_pairs.md`).
Create `reports/confusion_notes.md` and write 3–5 sentences in your own words about why the model mixes up these
class pairs (look at colours, shapes, textures, field patterns). Claude can suggest ideas if you ask, but the words
must be yours. Next `/next` checks that the file exists and has 3–5 sentences, then ticks 3.1.
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
- [ ] 3.1 Confusion analysis
- [ ] 3.2 Grad-CAM
- [ ] 4.1 Imagery pipeline
- [ ] 4.2 Patch cutter + labelling tool
- [ ] 4.3 Measure the drop
- [ ] 4.4 Fine-tune and re-measure
- [ ] 4.5 Publish the Indian dataset
- [ ] 4.6 Check data exists (change study)
- [ ] 4.7 Build the two maps
- [ ] 4.8 Sanity-check the change
- [ ] 5.1 ONNX export
- [ ] 5.2 Backend API + Docker
- [ ] 5.3 Website
- [ ] 6.1 Model on Hugging Face Hub
- [ ] 6.2 Deploy the API and the website
- [ ] 6.3 README
- [ ] 6.4 Blog post
- [ ] 7.1 Open-source polish
- [ ] 7.2 Launch

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

## Decisions made
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

## Known issues / things to revisit
<!-- e.g. Download from X was flaky, used mirror Y -->
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
- When running training in the background, use `python -u` so epoch lines show up live in the log (stdout is buffered when redirected to a file).

## Results so far (copied from results/ files only, with the file name)
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
