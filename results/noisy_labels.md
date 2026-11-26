# Noisy labels at scale (step 8.4)

**Tier-2 set** (ESA WorldCover 2021, "noisy reference", never ground truth): 1722 squares from the 2026 showcase composites (ahmedabad 720, vadodara 185, surat 349, rajkot 468). 995 squares were dropped for lying within the buffer of a hand-labelled area, 2371 as mixed or with no matching class. WorldCover classes kept (code: squares): {'10': 27, '20': 22, '30': 2, '40': 947, '50': 679, '80': 45}. Mapping: the 8.2 table, as sets ({'10': ['Forest'], '20': ['HerbaceousVegetation', 'Pasture'], '30': ['HerbaceousVegetation', 'Pasture'], '40': ['AnnualCrop', 'PermanentCrop'], '50': ['Residential', 'Industrial'], '60': [], '70': [], '80': ['River', 'SeaLake'], '90': [], '95': ['Forest'], '100': []}). Licence: ESA WorldCover: CC-BY-4.0 (Planetary Computer collection 'esa-worldcover'); credit: (c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. Note: map from 2021, pictures from the 2026 dry season.

**Agreement with the hand labels** (an agreement rate, not the product's accuracy): WorldCover gives a set for 155 of 230 hand-labelled squares; the hand label is in it for 134 (86.45%). Coarse sets (built-up = Residential or Industrial) make agreement easy.

**Three stages** (Indian leave-one-area-out accuracy, 149 fine-tune patches pooled, seeds [42, 43, 44], mean ± sample std):

| Stage | LOAO accuracy |
|---|---|
| A: hand labels only (8.1 audit) | 0.6555 ± 0.0169 |
| B: tier 2 only (no hand labels) | 0.4385 ± 0.0103 |
| C: tier 2, then hand labels | 0.5749 ± 0.0236 |

**Decision:** `A_hand_only` (rule in configs/noisy_train.yaml: better only if the mean beats A by more than the two stds added together).

Made by `src/noisy_labels.py` and `src/noisy_train.py`; numbers in `results/noisy_labels.json`.
