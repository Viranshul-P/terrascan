# CLAUDE.md — rules for working on TerraScan

Files that drive this project:
- `SPEC.md` — what we're building
- `PLAN.md` — the numbered steps (0.1, 0.2, 1.1, 2.2a … 7.2). Where SPEC and PLAN disagree, PLAN wins.
- `PROGRESS.md` — where we are. The single source of truth for "what's next".

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
  with real people (5.3), and posting the launch (7.2). For those, stop, mark the step `waiting on you` in
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
- Indian patch labels (4.2) and the change check (4.8): NOT decided yet. When the step comes, ask the user whether
  they or Claude will do it; don't start either way before they answer. Whoever does it, labelling happens blind to
  the model's predictions, and the dataset card, README and blog say who labelled (the user by hand, or Claude).
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
