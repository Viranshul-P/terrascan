# Contributing

Thanks for looking. TerraScan is small on purpose: plain functions, settings in YAML, every number read from `results/`.

## Set up

- Python 3.12: `python -m venv .venv`, then `pip install -r requirements.txt`. Tests: `pytest`. Lint: `ruff check .`
- Website: `cd web && npm ci`, then `npm run dev`, `npm test`, `npx tsc`.

Both test suites run without the network and without the (git-ignored) model files, so they pass on a fresh clone.

## Rules the project keeps

- **No hand-typed results.** A number in the README, the website or a report must be produced by code in this repo and
  saved in `results/`. Generators: `src/readme.py`, `src/web_story.py`, `scripts/web_live_config.py`.
- **Don't evaluate on the test areas to make choices.** Pick settings on validation data only.
- **Keep the browser and Python pipelines in step.** If you change one (`src/live.py`, `src/imagery.py`), change the other
  (`web/src/live/`) and re-run the parity check: `cd web && node scripts/browser-parity.mjs`, then
  `python -m src.browser_parity`. It must still give the same class for every square.
- Training scripts support `--fast-dev-run`; run it before a real run. Seeds 42, 43, 44.

## Pull requests

Small and focused, with a test for new logic. Say in the description what you checked and what you didn't.
Ideas to start with: [docs/good-first-issues.md](docs/good-first-issues.md).
