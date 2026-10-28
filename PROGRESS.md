# TerraScan — Progress

Claude updates this at the end of every step. Keep entries short.

## Current step
0.1

## Status
waiting on you
<!-- one of: not started | in progress | waiting on you | done -->

## Waiting on you
1. On github.com, create an empty **public** repo named `terrascan` (no README, no licence, no .gitignore).
2. Paste its URL to Claude (e.g. `https://github.com/<you>/terrascan.git`). Claude adds it as `origin` and pushes.
   If git asks you to log in, follow the prompt (or run `gh auth login` yourself).
3. Open the repo's **Actions** tab and confirm the CI run has a green tick. Tell Claude; 0.1 is done when CI is green.
<!-- When a step needs the user (labelling, W&B login, pushing to Hugging Face, writing a paragraph),
     write exactly what they must do here. /next checks this before moving on. -->

## Steps
- [ ] 0.1 Repo skeleton
- [ ] 0.2 Environment check
- [ ] 1.1 Download + split
- [ ] 1.2 Dataset + augmentations
- [ ] 1.3 Figures for the README
- [ ] 2.1 Training loop
- [ ] 2.2a Learn CNNs, write SmallCNN yourself
- [ ] 2.2b Review and train SmallCNN
- [ ] 2.2c Make SmallCNN exceptional (experiments)
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

## Decisions made
<!-- e.g. Pretrained models use 128×128 input (upscaled). Reason: ... -->
- Python 3.12 (not 3.11). Reason: laptop only has 3.12.5; pinned packages resolve fine on it. CLAUDE.md and START-HERE.md updated.

## Known issues / things to revisit
<!-- e.g. Download from X was flaky, used mirror Y -->

## Results so far (copied from results/ files only, with the file name)
<!-- e.g. ResNet-18 test acc: 0.98 (results/resnet18.json) -->
