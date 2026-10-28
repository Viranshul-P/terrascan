# TerraScan — Progress

Claude updates this at the end of every step. Keep entries short.

## Current step
2.2b

## Status
not started
<!-- one of: not started | in progress | waiting on you | done -->

## Waiting on you
(nothing)
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
- [ ] 2.2b Train SmallCNN v1
- [ ] 2.2c Make SmallCNN better (experiments)
- [ ] 2.3 ResNet-18 (ImageNet)
- [ ] 2.4 EfficientNet-B0
- [ ] 2.4b ResNet-18 (satellite-pretrained)
- [ ] 2.5 Evaluation + comparison table
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
- W&B on/off is `wandb.enabled` in the train config; off = `wandb.init(mode="disabled")`. Tests never call W&B online.
- Cosine LR steps once per epoch over `epochs` (T_max = epochs). Early stopping keeps the weights from the epoch with the lowest val loss.

## Known issues / things to revisit
<!-- e.g. Download from X was flaky, used mirror Y -->
- torchvision 0.29 warns that `torchvision.io.decode_image` is deprecated (moving to torchcodec). Works for now. If we switch decoders later, recompute data/stats.json.
- scripts/compute_stats.py takes ~3 min (reads 18,900 images one by one). Only run once, so left simple.
- In fast-dev-run, the 2 val batches are all AnnualCrop (val isn't shuffled), so fast-dev-run val accuracy means nothing. Only real runs count.

## Results so far (copied from results/ files only, with the file name)
<!-- e.g. ResNet-18 test acc: 0.98 (results/resnet18.json) -->
