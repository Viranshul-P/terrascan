# Other ways to improve Indian accuracy (step 8.6)

Metric: Indian leave-one-area-out accuracy on 149 fine-tune patches, seeds 42/43/44. Rule: configs/india_ablation.yaml (kept only if better than the reference by more than the stds added together). Test areas never used.

| Attempt | Result | Kept |
|---|---|---|
| reference (8.1 LOAO models) | 0.6555 ± 0.0169 | - |
| d: test-time augmentation (8 flips/turns, mean softmax) | 0.6779 ± 0.0293 | no |
| e: seed ensemble (mean softmax of 3 seeds) | 0.6711 (one number) | no |
| a: bigger context window per patch | not run: needs patches cut with a wider window from the original scenes; not built | no |
| b: dry season + monsoon input | not run: needs monsoon composites (8.7 data); 4.6 found 0 clear Jul-Aug scenes | no |
| c: pseudo-labels (tier 3) | not run: needs a training run; left for after 8.3b/8.4 (one GPU) | no |

Made by `src/india_ablation.py`; numbers in `results/india_ablation.json`.
