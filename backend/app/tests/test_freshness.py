"""Review-status flags for validated service guides (no new data collection)."""
from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.services import freshness, loader

client = TestClient(app)


def test_freshness_windows_are_deterministic():
    base = {"last_verified": "2026-10-17"}
    assert freshness.freshness(base, today=date(2026, 10, 17))["status"] == "fresh"
    assert freshness.freshness(base, today=date(2027, 3, 16))["status"] == "due_soon"
    assert freshness.freshness(base, today=date(2027, 4, 16))["status"] == "stale"
    assert freshness.freshness({"last_verified": "not-a-date"})["status"] == "unknown"


def test_service_api_surfaces_review_status():
    catalog = client.get("/api/services")
    assert catalog.status_code == 200
    for service in catalog.json()["services"]:
        assert service["review_status"] in ("fresh", "due_soon", "stale", "unknown")

    detail = client.get("/api/services/nid")
    assert detail.status_code == 200
    assert detail.json()["review_status"] in ("fresh", "due_soon", "stale", "unknown")

    checklist = client.post("/api/services/nid/checklist", json={
        "task": "new_registration", "answers": {"age": 25}, "language": "en"})
    assert checklist.status_code == 200
    assert checklist.json()["review_status"] in ("fresh", "due_soon", "stale", "unknown")


def test_every_enabled_service_has_a_parseable_review_date():
    for service in loader.list_services():
        assert freshness._parse_date(service["last_verified"]) is not None
