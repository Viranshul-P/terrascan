"""Step 8.5: Prithvi-EO-2.0-300M, frozen, linear probe. Rule and reasons: configs/foundation.yaml.

    python -m src.foundation --config configs/foundation.yaml
Writes results/foundation_models.json/.md. Features are cached in data/foundation/ (git-ignored).
"""

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import yaml
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from src.bands_train import Context
from src.data import CLASSES
from src.error_audit import loao_folds


def load_encoder(cfg):
    """The Prithvi ViT encoder from the official repo's own code and weights, one time step."""
    local = Path(cfg["local_dir"])
    pc = json.loads((local / "config.json").read_text(encoding="utf-8"))["pretrained_cfg"]
    spec = importlib.util.spec_from_file_location("prithvi_mae", local / "prithvi_mae.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    enc = mod.PrithviViT(img_size=pc["img_size"], patch_size=pc["patch_size"], num_frames=1,
                         in_chans=pc["in_chans"], embed_dim=pc["embed_dim"], depth=pc["depth"],
                         num_heads=pc["num_heads"], mlp_ratio=pc["mlp_ratio"], coords_encoding=[])
    sd = torch.load(local / "Prithvi_EO_V2_300M.pt", map_location="cpu", weights_only=True)
    sd = {k[len("encoder."):]: v for k, v in sd.items() if k.startswith("encoder.")}
    sd.pop("pos_embed", None)  # fixed sin-cos table, rebuilt by the model for one time step
    missing, unexpected = enc.load_state_dict(sd, strict=False)
    assert not unexpected and set(missing) <= {"pos_embed"}, (missing, unexpected)
    return enc.eval(), pc


def to_input(raw13, all_bands, bands, mean, std, size):
    """(N, 13, 64, 64) values (reflectance x 10000) -> (N, 6, 1, size, size), Prithvi's scaling."""
    x = raw13[:, [all_bands.index(b) for b in bands]].astype(np.float32)
    m = np.array(mean, np.float32)[None, :, None, None]
    x = (x - m) / np.array(std, np.float32)[None, :, None, None]
    x = F.interpolate(torch.from_numpy(x), size=(size, size), mode="bilinear", align_corners=False)
    return x.unsqueeze(2)


@torch.no_grad()
def features(enc, raw13, cfg, pc, all_bands, device):
    """Mean of the final tokens (class token left out), 1024 numbers per patch."""
    out = []
    for i in range(0, len(raw13), cfg["batch_size"]):
        x = to_input(raw13[i:i + cfg["batch_size"]], all_bands, cfg["bands"], pc["mean"], pc["std"],
                     cfg["image_size"]).to(device)
        with torch.autocast(device.type, dtype=torch.float16, enabled=device.type == "cuda"):
            tokens = enc.forward_features(x)[-1]
        out.append(tokens[:, 1:].float().mean(1).cpu().numpy())
    return np.concatenate(out)


def probe(train_x, train_y, c):
    scaler = StandardScaler().fit(train_x)
    lr = LogisticRegression(C=c, max_iter=3000).fit(scaler.transform(train_x), train_y)
    return lambda x: lr.predict(scaler.transform(x))


def main(argv=None):
    a = argparse.ArgumentParser()
    a.add_argument("--config", required=True)
    cfg = yaml.safe_load(Path(a.parse_args(argv).config).read_text(encoding="utf-8"))
    ctx = Context(yaml.safe_load(Path(cfg["bands_compare_config"]).read_text(encoding="utf-8")))
    all_bands = ctx.bands["all_bands"]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    enc, pc = load_encoder(cfg)
    enc.to(device)
    n_params = sum(p.numel() for p in enc.parameters())
    torch.cuda.reset_peak_memory_stats() if device.type == "cuda" else None

    cache = Path(cfg["features_dir"])
    cache.mkdir(parents=True, exist_ok=True)
    arr = np.load(ctx.array_path, mmap_mode="r")
    idx = ctx.index
    feats = {}
    for split in ["train", "val"]:
        f = cache / f"eurosat_{split}.npz"
        rows = idx[idx["split"] == split]
        if not f.exists():
            raw = np.asarray(arr[rows["row"].to_numpy()], dtype=np.float32)
            np.savez(f, x=features(enc, raw, cfg, pc, all_bands, device),
                     y=np.array([CLASSES.index(c) for c in rows["label"]]))
        feats[split] = np.load(f)
        print(split, feats[split]["x"].shape)
    peak_gb = torch.cuda.max_memory_allocated() / 1e9 if device.type == "cuda" else None

    patches = ctx.finetune_patches()
    areas = ctx.india_arrays("calibrated")
    raw_in = np.stack([np.moveaxis(areas[r.area][r.row:r.row + 64, r.col:r.col + 64], -1, 0)
                       for r in patches.itertuples()])
    india_x = features(enc, raw_in, cfg, pc, all_bands, device)
    india_y = np.array([CLASSES.index(c) for c in patches["final_label"]])

    ev, loao = {}, {}
    for seed in ctx.cfg["seeds"]:
        rng = np.random.default_rng(seed)
        pick = rng.choice(len(feats["train"]["y"]), cfg["eurosat_train_subset"], replace=False)
        tx, ty = feats["train"]["x"][pick], feats["train"]["y"][pick]
        pred = probe(tx, ty, cfg["probe_C"])
        ev[seed] = float((pred(feats["val"]["x"]) == feats["val"]["y"]).mean())
        correct = 0
        for area, _, _ in loao_folds(patches):
            held = (patches["area"] == area).to_numpy()
            p = probe(np.concatenate([tx, india_x[~held]]), np.concatenate([ty, india_y[~held]]),
                      cfg["probe_C"])
            correct += int((p(india_x[held]) == india_y[held]).sum())
        loao[seed] = correct / len(patches)
        print(f"seed {seed}: EuroSAT val {ev[seed]:.4f}, India LOAO {loao[seed]:.4f}")

    def ms(d):
        v = list(d.values())
        return {"mean": float(np.mean(v)), "std": float(np.std(v, ddof=1))}
    ref = json.loads(Path(cfg["reference_json"]).read_text(encoding="utf-8"))["reference_loao"]
    lo = ms(loao)
    out = {
        "config": "configs/foundation.yaml",
        "candidates": [
            {"model": "Prithvi-EO-2.0-300M", "source": f"https://huggingface.co/{cfg['repo']}",
             "licence": "Apache-2.0",
             "inputs": "6 HLS bands (B,G,R,narrow NIR,SWIR1,SWIR2), 224 px, up to 4 time steps",
             "params_encoder": n_params,
             "peak_vram_gb_inference": round(peak_gb, 2) if peak_gb else None,
             "vram_note": f"fp16 autocast, batch {cfg['batch_size']}, encoder only",
             "fits": True,
             "run": "linear probe",
             "full_finetune": "not attempted: ~4.8 GB for fp32 weights + AdamW state before "
                              "activations on an 8 GB GPU"},
            {"model": "Clay v1.5", "source": "https://huggingface.co/made-with-clay/Clay",
             "licence": "Apache-2.0", "run": "not run: its page lists no inputs or size"},
        ],
        "probe": {"eurosat_val": {"per_seed": ev, **ms(ev)},
                  "india_loao": {"per_seed": loao, **lo}},
        "reference_india_loao": {"what": "fine-tuned EfficientNet-B0 (8.1 LOAO models)",
                                 "mean": ref["mean"], "std": ref["std"]},
        "better_than_reference": lo["mean"] - ref["mean"] > lo["std"] + ref["std"],
        "input_note": "EuroSAT_MS is Level-1C top-of-atmosphere; the Indian values are Level-2A "
                      "calibrated to it (8.3a); Prithvi was pretrained on HLS surface reflectance.",
    }
    Path(cfg["output_json"]).write_text(json.dumps(out, indent=1), encoding="utf-8")
    Path(cfg["output_md"]).write_text(report(out), encoding="utf-8")
    print(json.dumps(out["probe"], indent=1), out["better_than_reference"])


def report(o):
    c, p, r = o["candidates"][0], o["probe"], o["reference_india_loao"]
    return "\n".join([
        "# Satellite foundation model (step 8.5)", "",
        "| Model | Licence | Inputs | Encoder params | Peak VRAM | Fits | Run |",
        "|---|---|---|---:|---|---|---|",
        f"| {c['model']} | {c['licence']} | {c['inputs']} | {c['params_encoder'] / 1e6:.0f} M | "
        f"{c['peak_vram_gb_inference']} GB ({c['vram_note']}) | yes | {c['run']} |",
        f"| {o['candidates'][1]['model']} | Apache-2.0 | - | - | - | - | "
        f"{o['candidates'][1]['run']} |", "",
        "**Linear probe on frozen Prithvi features** (seeds 42/43/44 = the EuroSAT subset):", "",
        f"- EuroSAT val accuracy: {p['eurosat_val']['mean']:.4f} ± {p['eurosat_val']['std']:.4f}",
        f"- Indian LOAO accuracy (149 fine-tune patches): "
        f"{p['india_loao']['mean']:.4f} ± "
        f"{p['india_loao']['std']:.4f}; reference ({r['what']}): {r['mean']:.4f} ± {r['std']:.4f}",
        f"- Better than the reference by the rule: {'yes' if o['better_than_reference'] else 'no'}",
        "", f"Full fine-tune: {c['full_finetune']}.", "", f"Note: {o['input_note']}", "",
        "Made by `src/foundation.py` with `configs/foundation.yaml`; numbers in "
        "`results/foundation_models.json`.",
    ]) + "\n"


if __name__ == "__main__":
    main()
