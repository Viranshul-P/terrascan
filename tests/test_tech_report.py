"""Step 8.11: the report generator fills every number and names only existing result files."""

import re
from pathlib import Path

import pytest

from src.tech_report import TEMPLATE, make, phase8


def test_make_refuses_a_missing_number():
    with pytest.raises(AssertionError, match="no value for"):
        make("accuracy {acc}", {})


def test_phase8_summary_counts_kept_ideas():
    rows = [{"question": "q", "result": "r", "decision": "No: worse.", "source": "results/x.json"}]
    assert phase8(rows)[1] == "none beat the simple fine-tuned model"
    rows.append({**rows[0], "decision": "Better by the rule."})
    assert phase8(rows)[1] == "1 of 2 helped"


def test_template_cites_only_files_that_exist():
    for path in re.findall(r"`(results/[^`{]+)`", TEMPLATE.read_text(encoding="utf-8")):
        assert Path(path).exists(), path
