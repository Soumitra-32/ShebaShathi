import json
from pathlib import Path

import pytest

from app.engine.fees import calculate


@pytest.fixture(scope="module")
def data():
    path = Path(__file__).resolve().parents[3] / "data" / "fees.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("row", json.loads((Path(__file__).resolve().parents[3] / "data" / "fees.json").read_text(encoding="utf-8"))["fees"])
def test_every_published_combo_has_inclusive_vat_breakdown(row):
    result = calculate(row["pages"], row["validity_years"], row["delivery"])
    assert result["total"] == row["total"]
    assert result["base"] + result["vat"] == result["total"]
    assert result["fees_include_vat"] is True
    assert result["source_url"].startswith("https://www.epassport.gov.bd/")
    assert result["last_verified"]
    assert result["timeline_note"]


def test_fee_lookup_does_not_invent_unlisted_combinations():
    with pytest.raises(ValueError, match="not listed"):
        calculate(36, 5, "regular")
