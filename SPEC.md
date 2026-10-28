# TerraScan — Build Spec

**One line:** A deep learning model that reads satellite images and maps land use (farmland, forest, residential, industrial, water…). Drop a pin on any city and see what the land is made of, and how it changed between two years.

**Covers on your resume:** CNNs from scratch, transfer learning, model comparison, explainability (Grad-CAM), experiment tracking (MLOps), model deployment.

> **Note:** This file says *what* we're building. `PLAN.md` says *how*, step by step.
> Where they disagree (e.g. ViT vs EfficientNet, how the website is built), **PLAN.md wins**.
> To start working, see `START-HERE.md`.

---

## Why this project stands out

- It's not just "train a classifier". You compare four models properly and explain the trade-offs.
- It has a visual demo anyone understands in five seconds: a colored map overlay on a real city.
- It includes an honest **domain-shift test**: the training data is European, so you measure how much accuracy drops on Indian imagery, then fix it. Interviewers love this because it shows you understand that models fail outside their training data.

---

## Stack

| Part | Choice |
|---|---|
| Framework | PyTorch + torchvision (+ `timm` and `torchgeo` for pretrained models) |
| Dataset | **EuroSAT RGB** (27,000 labelled Sentinel-2 image patches, 64×64, 10 classes) |
| Experiment tracking | Weights & Biases (free) or MLflow |
| Explainability | Grad-CAM (`pytorch-grad-cam`) |
| Live imagery (Phases 4–5) | Microsoft Planetary Computer Sentinel-2 L2A via `pystac-client` + `planetary-computer` |
| Export | ONNX for fast CPU inference |
| App | FastAPI backend (ONNX) + map-first website (Vite, React, TypeScript, MapLibre GL, Tailwind) |
| Deploy | Hugging Face Space (API) + free static hosting (website) + Hugging Face Hub (model, dataset) |

---

## Phases

### Phase 1 — Data
- Download EuroSAT RGB. Stratified train / val / test split (70 / 15 / 15), fixed seed.
- Show class balance and a grid of sample images per class (save as figures for the README).
- Augmentations: flips, 90° rotations, light color jitter (satellite images have no "up").

### Phase 2 — Four models, compared fairly
1. **Small CNN from scratch** (3–4 conv blocks, batch norm, dropout). Write it by hand. This is the one you'll be asked to explain layer by layer.
2. **ResNet-18 transfer learning** (ImageNet weights, fine-tuned).
3. **EfficientNet-B0** via `timm`.
4. **ResNet-18 pretrained on satellite images** (torchgeo `SENTINEL2_RGB_MOCO`, SSL4EO-S12). Same architecture as #2,
   different starting weights, to answer: does satellite pretraining beat photo pretraining, in Europe and in India?
- Same splits, same epochs budget, early stopping on val.
- Log everything to W&B: loss curves, accuracy, per-class F1, confusion matrix, parameter count, CPU inference time per image.
- Output: one comparison table (accuracy, F1, params, ms/image).

### Phase 3 — Understand the model
- Confusion matrix analysis: which classes get mixed up and why (e.g., highway vs residential).
- Grad-CAM heatmaps for correct and wrong predictions. Save a figure grid for the README.

### Phase 4 — Domain-shift test on India
- Use the Planetary Computer API to pull Sentinel-2 RGB tiles around a few Indian areas (e.g., Ahmedabad, Vadodara outskirts, a river, farmland).
- Cut into 64×64 patches; hand-label ~200 patches with a tiny labelling script (Claude Code can build a quick Gradio labeller).
- Measure accuracy of the best model on this Indian set → report the drop.
- Fix it: fine-tune on part of the Indian patches (keep the rest as test). Report before / after.
- Labelling rules: done by hand by me (not by an AI), skip unclear patches, aim for roughly 20 per class, patches from several different areas. 100 is acceptable, 200 is better.
- **Publish the Indian dataset** on Hugging Face Datasets with a short dataset card (where the images come from, how they were labelled, class counts).

### Phase 4.5 — Ahmedabad change study (the real finding)
- Pull Sentinel-2 imagery for the same Ahmedabad-area box for two years (e.g., 2018 and 2026, same season to avoid seasonal color differences, low cloud cover).
- Run the fine-tuned model on both, compute area per class (km²) and the change between years.
- Report it as a short finding with a map figure: e.g., "X km² of farmland around Ahmedabad converted to residential/industrial between 2018 and 2026."
- State the limits honestly: patch-level resolution, model error rate, seasonal effects.

### Phase 5 — The website
- Map-first site that opens on Ahmedabad with a before/after swipe slider and the key finding in one sentence.
- Preset Indian cities are pre-computed static files, so the showcase loads instantly even if the API is asleep;
  "map your own area" runs the model live through the API.
- Hover a patch for class + confidence; km² per class, biggest changes, downloads (GeoTIFF, PNG, CSV), limitations note.
- Calm, quick feel with only purposeful motion; accessible and mobile-friendly; tested on 3 real people.

### Phase 6 — Deploy + README
- Push the model to Hugging Face Hub with a model card (data, metrics, limitations, domain-shift result).
- Deploy the API on a Hugging Face Space and the website on free static hosting.
- README: pitch, live demo link, GIF of the map overlay, model comparison table, Grad-CAM figure, domain-shift results, Ahmedabad change finding, how to reproduce training.
- Write one short blog post (DEV, Medium or Hashnode) on the domain-shift result and the Ahmedabad finding. Link it from the README.

### Phase 7 — Open-source polish + launch
- Licence, citation file, contributing guide, good-first-issues, badges.
- Launch: blog, LinkedIn, Reddit (remote sensing, GIS, ML, local), Show HN, dataset lists, torchgeo dataset proposal.

---

## Engineering checklist (what separates this from a notebook project)
- Training code as proper Python modules (`src/data.py`, `src/models.py`, `src/train.py`) with a config file, not only notebooks. A notebook can call them.
- `Dockerfile` for the API
- `tests/` with pytest: data loader shapes, model forward pass, ONNX output matches PyTorch output
- GitHub Actions CI: tests + lint (`ruff`) on every push
- Model versioning: each trained model saved with its config and metrics (W&B artifacts or a simple `models/` registry)
- README written as a short case study: problem → approach → results → what failed and how you fixed it

## Resume bullet (fill in real numbers after Phase 4)

> **TerraScan** — Satellite land-use mapping with CNNs (PyTorch, W&B, ONNX, FastAPI, React) · [Live] · [GitHub] · [Model]
> - Trained and compared a from-scratch CNN, ResNet-18 (ImageNet vs satellite-pretrained) and EfficientNet-B0 on 27K Sentinel-2 images; best model reached **__%** test accuracy at **__ ms**/image on CPU.
> - Measured a **__%** accuracy drop on hand-labelled Indian imagery (domain shift) and recovered **__** points by fine-tuning on **__** local samples.
> - Built and deployed a map-first web app that maps land use for any location and quantifies change between years (e.g., **__ km²** of farmland converted near Ahmedabad, 2018–2026).
> - Released a hand-labelled Indian Sentinel-2 test set (**__** patches, 10 classes) on Hugging Face.

## Stretch ideas (later)
- Use all 13 spectral bands (EuroSAT MS) instead of RGB and compare.
- Segmentation instead of patch classification for sharper maps.
- pip-installable command-line tool for GIS users (only if people ask for it).
- Small ViT as a fifth model.
