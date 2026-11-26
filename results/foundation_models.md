# Satellite foundation model (step 8.5)

| Model | Licence | Inputs | Encoder params | Peak VRAM | Fits | Run |
|---|---|---|---:|---|---|---|
| Prithvi-EO-2.0-300M | Apache-2.0 | 6 HLS bands (B,G,R,narrow NIR,SWIR1,SWIR2), 224 px, up to 4 time steps | 304 M | 2.67 GB (fp16 autocast, batch 32, encoder only) | yes | linear probe |
| Clay v1.5 | Apache-2.0 | - | - | - | - | not run: its page lists no inputs or size |

**Linear probe on frozen Prithvi features** (seeds 42/43/44 = the EuroSAT subset):

- EuroSAT val accuracy: 0.9611 ± 0.0028
- Indian LOAO accuracy (149 fine-tune patches): 0.5705 ± 0.0374; reference (fine-tuned EfficientNet-B0 (8.1 LOAO models)): 0.6555 ± 0.0169
- Better than the reference by the rule: no

Full fine-tune: not attempted: ~4.8 GB for fp32 weights + AdamW state before activations on an 8 GB GPU.

Note: EuroSAT_MS is Level-1C top-of-atmosphere; the Indian values are Level-2A calibrated to it (8.3a); Prithvi was pretrained on HLS surface reflectance.

Made by `src/foundation.py` with `configs/foundation.yaml`; numbers in `results/foundation_models.json`.
