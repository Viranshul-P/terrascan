# CLAUDE.md — rules for working on TerraScan

Files that drive this project:
- `SPEC.md` — what we're building
- `PLAN.md` — the numbered steps (0.1, 0.2, 1.1, 2.2a … 7.2, plus Phase 8 and the optional 9.1). Where SPEC and PLAN
  disagree, PLAN wins. Order since 2026-11-08: 8.1–8.12 run BEFORE 6.3, 6.4, 7.1 and 7.2.
- `PROGRESS.md` — where we are. The single source of truth for "what's next".
- `learn/` (git-ignored) — plain-English notes for the user to study later. Every step ends by adding to them.

**Direction (user's decision, 2026-11-08):** TerraScan is a background research project, not a flagship. Claude does all
the work; the user approves each plan and does only the unavoidable parts (sign-ups, pushing to Hugging Face). Main goal:
clearly better detection on Indian land. Second goal: a multi-city India evaluation study.

The user drives work with three commands:
- `/next` — do the next step in PROGRESS.md
- `/progress` — show where we are (read-only)
- `/review-step` — a fresh reviewer checks the last finished step

## How we work
- ONE step per session. Never start the following step on your own, even if there's time left.
- Before writing code, show a short plan for the step and wait for the user's OK.
- Keep changes small. If a step turns out bigger than expected, stop and suggest splitting it.
- **You do** parts: Claude does them too (user's decision, 2026-10-30: the goal is a project to show now; the user
  will learn the details after their ML course). Only these stay with the user: anything that needs their accounts,
  logins or signatures (GitHub, W&B, Hugging Face, deploy services, pushing/publishing under their name), testing
  with real people (5.3d), and posting the launch (7.2). For those, stop, mark the step `waiting on you` in
  PROGRESS.md, and tell the user exactly what to do.
- Record honestly who did what. When Claude does a "You do" part (labels, judgements, write-ups), say so in
  PROGRESS.md and in any README, dataset/model card or blog text about it. Never present Claude's work as the user's.
- If something is unclear or you're guessing, ask. Do not invent an answer.
- Explain in plain, simple English. The user is learning; short explanations beat long ones.

## Honesty rules (most important)
- Never write a metric, number or result anywhere (README, model card, PROGRESS.md, blog)
  unless code in this repo produced it and saved it in `results/` or `models/`.
  Always say which file it came from.
- Never claim something works without running it. "Should work" is not done.
- If a training run, download or test fails, say so plainly. Don't hide it or quietly work around it.
- **Label tiers (Indian data, from 2026-11-08; replaces the old "ask who labels" rule):**
  - Tier 1 = the user's existing hand labels (`data/india/labels_reviewed.csv`, final labels). The only human gold.
    Used for evaluation. New tier-1 labels (for example in other cities, 8.7) are made only the way 4.2 did it: the
    labeller works blind to the model's predictions and the user reviews every patch; ask the user how at that step.
  - Tier 2 = public land-cover products (ESA WorldCover, Dynamic World): "noisy reference", for training or comparison,
    with the class mapping documented (8.2).
  - Tier 3 = model-assisted labels (pseudo-labels): flagged in the data, for training only.
  - Never call tier 2 or tier 3 labels ground truth, and never evaluate on them as if they were.
  - Every choice (classes, bands, models, settings, thresholds) is made on val or fine-tune data only. The Indian TEST
    areas and the held-out city are scored once, in 8.8. The TEST areas were already scored in 4.3/4.4, so say that
    wherever their results appear.
  - No claim of "novel" or "first" without a literature check the user can verify (sources actually opened).
  - In-distribution EuroSAT accuracy is reported as "consistent with published results", never as beating the state of
    the art.
- Don't make up download URLs, API fields or library functions. If unsure, check the installed
  library (`python -c "import x; help(x.y)"`) or ask.

## Code rules
- Python 3.12, PyTorch. Versions pinned in `requirements.txt`; don't upgrade without asking.
- Reusable code lives in `src/` (`data.py`, `models.py`, `train.py`, `evaluate.py`, …).
  Notebooks only call functions from `src/`.
- All settings (paths, epochs, lr, batch size, seed, image size) come from YAML in `configs/`.
- Seed everything (python, numpy, torch). Default seed: 42.
- Every training script supports `--fast-dev-run` (1–2 batches, 1 epoch). Always run that before a real run.
- Every trained model is saved to `models/<run_name>/seed<N>/` with weights, the exact config, and `metrics.json`.
- Tests in `tests/` (pytest). Lint with `ruff`. Both must pass before any commit.
  Tests never call the network or W&B (W&B is disabled in tests).
- Large files (datasets, weights, imagery) are git-ignored. Never commit them.
- The website lives in `web/` (TypeScript, React, MapLibre) and the API in `api/`. Same rules: simple, tested, no
  numbers hard-coded in the UI (it reads them from data files generated from `results/`).
- Everything must run on free tiers. Never add a paid service, API key or credit-card signup without asking first.
- Keep code simple. The user must explain every line in interviews. No clever abstractions,
  no extra features nobody asked for.

## Hardware
- Laptop: NVIDIA RTX 4060, 8 GB VRAM. Train locally on CUDA.
- If you hit out-of-memory, lower the batch size and say so.

## Project facts to keep straight
- EuroSAT RGB: 27,000 images, 64×64, 10 classes.
- Splits are saved once to `data/splits/*.csv` and reused by every model. Never re-split.
- The test split is for final reporting only (step 2.5 and later evaluation steps). Never use it to choose
  hyperparameters, architectures, epochs or "the best model". Use val for every decision.
- Final model results are mean ± std over seeds 42, 43, 44. Don't claim one model beats another when their ranges overlap.
- Sentinel-2 L2A scenes with processing baseline 04.00 or higher have a +1000 DN offset. This started on
  25 Jan 2022, but re-processed older scenes can have it too. Decide **per scene** from `s2:processing_baseline`,
  never from the date, and subtract the offset before scaling.
- 1 patch = 64×64 px at 10 m = 640 m × 640 m = 0.4096 km².
- India "before fine-tuning" accuracy in the README, website, blog and any public text: always the 3-seed number
  (Indian TEST areas, EfficientNet-B0, seeds 42/43/44, mean ± std: 0.4486 ± 0.0071, key
  `summary_mean_std_over_seeds.india_test_accuracy_before` in `results/india_after.json`), shown next to
  the 3-seed "after" number. Never the seed-42-only 0.444 from `results/india_before.json`. Read the numbers from
  the file; don't copy them by hand.
