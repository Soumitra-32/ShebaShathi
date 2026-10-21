"""Tests for the verified multi-service fee schedule catalog."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.engine import fee_schedules
from app.main import app

client = TestClient(app)
DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def test_catalog_exposes_every_service_with_a_source_and_a_date():
    catalog = fee_schedules.catalog()
    assert catalog["services"]
    for service in catalog["services"]:
        assert service["service_id"]
        assert service["source_url"].startswith("https://")
        assert service["last_verified"]
        assert "available" in service


def test_every_fee_rule_components_add_up_to_its_total():
    for service in fee_schedules.catalog()["services"]:
        for rule in service["fee_rules"]:
            components_total = sum(part["amount"] for part in rule["components"])
            assert components_total == rule["total"], rule["id"]


def test_epassport_entries_match_the_legacy_fee_file():
    legacy = json.loads((DATA_DIR / "fees.json").read_text(encoding="utf-8"))
    epassport = next(
        service for service in fee_schedules.catalog()["services"] if service["service_id"] == "epassport"
    )
    catalog_rows = {
        (rule["selection"]["pages"], rule["selection"]["validity_years"], rule["selection"]["delivery"]): rule["total"]
        for rule in epassport["fee_rules"]
    }
    legacy_rows = {
        (str(row["pages"]), str(row["validity_years"]), row["delivery"]): row["total"]
        for row in legacy["fees"]
    }
    assert catalog_rows == legacy_rows


def test_epassport_total_matches_the_inclusive_vat_breakdown():
    epassport = next(
        service for service in fee_schedules.catalog()["services"] if service["service_id"] == "epassport"
    )
    vat_rate = json.loads((DATA_DIR / "fees.json").read_text(encoding="utf-8"))["vat_rate"]
    for rule in epassport["fee_rules"]:
        base = round(rule["total"] / (1 + vat_rate))
        assert base + (rule["total"] - base) == rule["total"]


def test_calculate_returns_the_breakdown_and_the_source():
    result = fee_schedules.calculate("epassport", {"pages": "48", "validity_years": "10", "delivery": "regular"})
    assert result["total"] == 5750
    assert [part["id"] for part in result["components"]] == ["base", "vat"]
    assert result["source_url"].startswith("https://")
    assert result["last_verified"]


def test_calculate_adds_the_late_renewal_charge_per_year():
    result = fee_schedules.calculate(
        "driving_licence", {"service_type": "renewal", "professional": "no", "years_late": 2}
    )
    assert result["total"] == 2185 + 400
    assert result["components"][-1]["id"] == "late_penalty"


def test_calculate_rejects_an_unpublished_combination(monkeypatch):
    epassport = fee_schedules.SERVICES["epassport"]
    monkeypatch.setitem(
        fee_schedules.SERVICES, "epassport", {**epassport, "fee_rules": epassport["fee_rules"][:2]}
    )
    with pytest.raises(ValueError, match="not listed"):
        fee_schedules.calculate("epassport", {"pages": "48", "validity_years": "10", "delivery": "regular"})


def test_calculate_rejects_an_option_that_is_not_published():
    with pytest.raises(ValueError, match="not published"):
        fee_schedules.calculate("epassport", {"pages": "36", "validity_years": "5", "delivery": "regular"})


def test_calculate_rejects_an_unknown_service():
    with pytest.raises(ValueError, match="not available"):
        fee_schedules.calculate("invented_service", {})


def test_calculate_rejects_an_unknown_parameter():
    with pytest.raises(ValueError, match="Unsupported fee parameter"):
        fee_schedules.calculate(
            "epassport", {"pages": "48", "validity_years": "10", "delivery": "regular", "nid": "1234"}
        )


def test_calculate_rejects_a_service_without_a_verified_schedule():
    for service in fee_schedules.catalog()["services"]:
        if not service["available"]:
            with pytest.raises(ValueError, match="no verified fee schedule"):
                fee_schedules.calculate(service["service_id"], {})
            break
    else:
        pytest.fail("expected at least one service without a verified schedule")


def test_fee_schedule_endpoint_returns_the_public_catalog():
    response = client.get("/api/fee-schedules")
    assert response.status_code == 200
    payload = response.json()
    assert payload["services"]
    assert all(service["source_url"].startswith("https://") for service in payload["services"])
