"""Step 8.11: build reports/technical_report.md from src/tech_report_template.md and results/.

Same rule as the README: every number is read from a file by code. Phase 8 rows come from the
same list the website uses (src/web_story.experiments), so the two always agree.
    python -m src.tech_report
"""

import re
from pathlib import Path

import yaml

from src.readme import broken_links, build_readme_numbers, load_json
from src.web_story import experiments

TEMPLATE = Path("src/tech_report_template.md")
OUT = Path("reports/technical_report.md")
README_CONFIG = Path("configs/readme.yaml")


SHORT = {"results/noisy_labels.json": "WorldCover-derived training squares",
         "results/india_ablation.json": "test-time augmentation and a seed ensemble",
         "results/foundation_models.json": "a frozen satellite foundation model",
         "results/bands_comparison.json": "extra spectral bands"}


def phase8(rows):
    """Markdown table rows and a one-line summary of the Phase 8 decisions."""
    table = "\n".join(f"| {r['question']} | {r['result']} | {r['decision']} | `{r['source']}` |"
                      for r in rows)
    kept = [r for r in rows if r["decision"].startswith(("Better", "Kept", "Yes"))]
    summary = ("none beat the simple fine-tuned model" if not kept
               else f"{len(kept)} of {len(rows)} helped")
    return table, summary


def numbers(repro_note):
    n = build_readme_numbers(yaml.safe_load(README_CONFIG.read_text(encoding="utf-8")))
    noisy = load_json("results/noisy_labels_data.json")
    rows = [r for r in experiments() if "Extension" not in r["question"]]
    table, summary = phase8(rows)
    n.update({
        "n_tier2": f"{noisy['n_squares']:,}",
        "wc_agreement": f"{noisy['agreement_with_hand_labels']['agreement_rate']:.0%}",
        "wc_compared": noisy["agreement_with_hand_labels"]["compared"],
        "phase8_table": table,
        "phase8_summary": summary,
        "phase8_list": ", ".join(SHORT[r["source"]] for r in rows),
        "repro_note": repro_note,
    })
    return n


def make(template, n):
    missing = sorted(set(re.findall(r"{([a-z0-9_]+)}", template)) - set(n))
    assert not missing, f"no value for: {missing}"
    return template.format(**n)


def main(repro_note="not re-checked for this build"):
    text = make(TEMPLATE.read_text(encoding="utf-8"), numbers(repro_note))
    for path in re.findall(r"`(results/[^`]+)`", text):
        assert Path(path).exists(), f"the report names a missing file: {path}"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    bad = broken_links(text)
    print(f"wrote {OUT} ({len(text.split())} words)" + (f"; broken links: {bad}" if bad else ""))


if __name__ == "__main__":
    main()
