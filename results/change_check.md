# Step 4.8: how much of the reported change is real?

All numbers below come from `results/change_check.json` (made by
`python -m src.change_check --config configs/change.yaml summarise`), which reads
`results/change_check_reviewed.csv` and `results/change_2018_2026.json`.

## What was done
- The 2018 vs 2026 Ahmedabad maps (step 4.7, map seed 42) report **780 patches (319.488 km²)** as having
  changed class.
- 50 of them were picked at random (seed 42). Each was shown as a 2018 / 2026 image pair, with the patch
  outlined and some surroundings. **The model's classes were not shown.**
- Question: did the land in the patch really change (new buildings, roads, cleared land, water)? A
  different crop colour or brightness alone counts as no.
- **Who judged:** Claude answered all 50 first (`results/change_check_claude.csv`). The user then reviewed
  every pair and changed 6 answers (`results/change_check_reviewed.csv`). The final answers below are the
  reviewed ones.

## Result
| | yes | no | unclear | real rate = yes / (yes + no) | 95% range |
|---|---|---|---|---|---|
| Final (after the user's review) | 24 | 23 | 3 | 0.5106 | 0.3724 – 0.6472 |
| Claude before review | 21 | 22 | 7 | 0.4884 | 0.3462 – 0.6325 |

**Finding:** about half (51%, 95% range 37–65%) of the patches the model reports as "changed"
show a real change on the ground. The other half are false alarms from model errors in one or both years.
Scaling up roughly, that means about **163 km² of real change (range 119–207 km²)** instead of the
319 km² the raw maps show. This rough number assumes the sample represents all 780 patches and leaves the
3 unclear pairs out. The 119–207 range covers only the sampling error of 50 pairs, applied to seed 42's
319.488 km². It ignores seed-to-seed spread (the 3-seed mean in step 4.7 is a different number) and what the
3 unclear pairs really are.

Claude's by-eye impression from the pairs (not measured): the real changes were mostly on the city's edges: new road grids and plotted land, new housing and
building complexes, a new expressway or rail line. Most false alarms were in dense city, where both years
are built-up, or in farmland, where the crops looked different in the two winters.

## Honest limits
- **"Real" means something visibly changed, not that the class change is right.** A patch counted "yes"
  can still have the wrong new class, e.g. new housing labelled Industrial. This check doesn't measure
  whether the class is right.
- **Only reported changes were checked.** Missed changes (real change the model calls "no change") weren't
  measured, so the true changed area could be higher.
- **Patch size is 640 m × 640 m (0.4096 km²).** A patch with a new road along one side counts as
  "changed", but most of its area may not have changed. The km² numbers are patch areas, not exact
  built-up areas.
- **Small sample.** With 50 pairs the 95% range is wide (about ±14 points).
- **Model error.** The fine-tuned EfficientNet-B0 (step 4.4) still makes mistakes on Indian patches, and
  errors from both years add up.
- **Season.** Both years use Dec–Feb, but the crop stage and stubble differ between the two winters, which
  causes farmland false alarms.
- **Composite vs single scene.** The maps use per-pixel median composites of several scenes, but the model
  was fine-tuned on single-scene patches (step 4.7 known issue). Colours differ a little between years
  (different processing baselines, see `results/change_2018_2026.json`).
- **One seed for the sample.** The sample comes from the map seed (42) only. Seeds 43 and 44 report a
  similar number of changed patches but were not checked separately.
- **Judges.** Claude judged first and the user reviewed Claude's answers (rather than judging from
  scratch), so the final answers may lean towards Claude's.
- **Blindness was by procedure.** The pair images and the review page never show the model's classes.
  But Claude ran in the same session as the code that can read the class file
  (`results/change_2018_2026_patches.csv`), so nothing technically stopped Claude from looking. Claude only
  printed the first 2 data rows of that file (patches at row 0, which are not in the sample) before judging.
- The optional cross-check with ESA WorldCover was not done.
