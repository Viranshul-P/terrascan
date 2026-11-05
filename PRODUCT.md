# Product

<!-- impeccable:product-schema 1 -->

Written by Claude during step 5.3a (`/impeccable init`), from SPEC.md, PLAN.md, the repo, and the user's answers on
2026-11-05. Facts marked "inferred" came from the repo, not from a user answer.

## Platform

web

## Stack
Vite + React + TypeScript + MapLibre GL, in `web/`. Styling is plain CSS with CSS custom properties, no Tailwind
(user's choice, 2026-11-05). A small FastAPI service in `api/` is only for "map your own area". Free static hosting
for the site (step 6.2). Free tiers only.

## Users
Primary (user's answer): recruiters and engineers judging the author's work. They skim for 30 to 60 seconds and
want to see a real working model, honest numbers and good engineering. Curious members of the public come second.

## Product Purpose
TerraScan is a land-use model for satellite images (10 classes: farmland, forest, residential, industrial, water and
more). The website shows how Indian cities changed between two years (2018 and 2026), on a real map, and lets a
visitor map a small area of their own. Success: after one minute a visitor remembers "an AI that maps how Indian
cities changed, and honestly tells you how wrong it can be" (user's answer).

## Positioning
Most land-use demos show a map and stop. TerraScan shows the map and then measures itself: the model was trained on
European images, the site shows how much it got worse on Indian images and how fine-tuning fixed part of that, and it
compares the change it reports in Ahmedabad with a hand-checked sample of how much change was real.

## Operating Context
Visitors arrive from a resume, GitHub, LinkedIn or a blog post, on a laptop or a phone. They don't install anything.
The showcase cities (Ahmedabad, Vadodara, Surat, Rajkot) are pre-computed static files, so they load instantly; the
live "map your own area" depends on a free API host that sleeps and needs time to wake up.

## Capabilities and Constraints
- Showcase: before/after (2018 | 2026) land-use overlay per city, per-patch class and confidence, km² per class,
  biggest from→to changes, downloads (GeoTIFF, PNG, CSV). Files in `web/public/data/<city>/`.
- Live: draw a box up to about 10 × 10 km, pick a year, get the same map from the API (`api/`).
- One patch = 64 × 64 px at 10 m = 640 m × 640 m. The map is coarse: one class per 640 m square.
- The model is only measured on Gujarat. Live maps elsewhere are untested and the site must say so.
- Reported change is inflated: the 4.8 check found about half of the reported Ahmedabad change was real. The other
  three cities were not checked; the site must say so next to their change numbers.
- Every number on the site is read from data files generated from `results/`, never typed into the UI.
- English only (user's answer).

## Brand Commitments
- Name: TerraScan. No logo or brand colours exist yet (inferred).
- Design brief in PLAN.md (5.3a and "Rules for all of 5.3a–5.3d") is binding: Apple-like restraint, calm, lots of
  whitespace, large confident type for key numbers, nothing cluttered or "funky"; visual first (one strong visual plus
  one or two short sentences per section); a globe that flies down to Ahmedabad and tilts into 3D; purposeful motion
  only; fast. Neutral palette with one accent colour.
- Voice: plain, honest, short. No hype.

## Evidence on Hand
- Map data: `web/public/data/index.json` and `web/public/data/<city>/summary.json`, overlays, RGB WebP, GeoTIFF,
  GeoJSON, CSV.
- Model comparison (Europe): `results/comparison.md` and `results/<model>.json`.
- India drop and fix (3 seeds): `results/india_after.json`, key `summary_mean_std_over_seeds`.
- Change check (Ahmedabad): `results/change_check.json` and `results/change_check.md`.
- Grad-CAM and other figures: `reports/figures/`.
- No testimonials, users, press or usage numbers exist. Don't invent any.

## Product Principles
1. Show, then measure. Every claim on the map is followed by how far to trust it.
2. Limitations are part of the product, shown plainly, never hidden (user's answer).
3. The visitor sees it work within seconds, without reading.
4. Every number comes from a file, and the file is named somewhere a curious visitor can find it.

## Accessibility & Inclusion
Works on a 360 px wide phone and with a keyboard; land-use class colours are colour-blind safe; all motion respects
`prefers-reduced-motion` (PLAN.md rules for 5.3).
