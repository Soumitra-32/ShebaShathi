import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import loader

client = TestClient(app)


def test_catalog_lists_enabled_services_with_review_dates():
    response = client.get("/api/services")
    assert response.status_code == 200
    body = response.json()
    assert body["disclaimer_bn"]
    assert body["disclaimer_en"]
    ids = {service["service_id"] for service in body["services"]}
    assert {"epassport", "birth_registration", "nid", "driving_licence", "death_registration"} <= ids
    for service in body["services"]:
        assert service["enabled"] is True
        assert service["source_url"].startswith("https://")
        assert service["last_verified"]
        assert service["tasks"]


def test_service_overview_and_unknown_service():
    response = client.get("/api/services/nid")
    assert response.status_code == 200
    body = response.json()
    assert body["service_id"] == "nid"
    assert body["fallback_bn"]
    task_ids = {task["id"] for task in body["tasks"]}
    assert "new_registration" in task_ids and "correction" in task_ids

    missing = client.get("/api/services/does_not_exist")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "SERVICE_NOT_FOUND"


def test_birth_registration_conditional_branch_by_age():
    under_five = client.post("/api/services/birth_registration/checklist", json={
        "task": "new_registration", "answers": {"age": 3}, "language": "bn",
    })
    assert under_five.status_code == 200
    ids = {doc["id"] for doc in under_five.json()["documents"]}
    assert "birth_proof_under5" in ids
    assert "age_proof_over5" not in ids
    assert under_five.json()["steps"]

    over_five = client.post("/api/services/birth_registration/checklist", json={
        "task": "new_registration", "answers": {"age": 10}, "language": "en",
    })
    assert over_five.status_code == 200
    ids = {doc["id"] for doc in over_five.json()["documents"]}
    assert "age_proof_over5" in ids
    assert "birth_proof_under5" not in ids


def test_epassport_minor_parent_nid_branch_is_preserved():
    without_nid = client.post("/api/services/epassport/checklist", json={
        "task": "minor", "answers": {"age": 5, "has_own_nid": False},
    })
    assert without_nid.status_code == 200
    ids = {doc["id"] for doc in without_nid.json()["documents"]}
    assert "parent_nid" in ids and "child_photo" in ids

    with_nid = client.post("/api/services/epassport/checklist", json={
        "task": "minor", "answers": {"age": 10, "has_own_nid": True},
    })
    ids = {doc["id"] for doc in with_nid.json()["documents"]}
    assert "parent_nid" not in ids
    assert "child_photo" not in ids


def test_service_checklist_rejects_unknown_task_and_fields():
    unknown_task = client.post("/api/services/nid/checklist", json={"task": "nope", "answers": {}})
    assert unknown_task.status_code == 422

    unknown_field = client.post("/api/services/nid/checklist", json={
        "task": "new_registration", "answers": {"nid_number": "1234567890"},
    })
    assert unknown_field.status_code == 422

    extra_top_level = client.post("/api/services/nid/checklist", json={
        "task": "new_registration", "answers": {"age": 25}, "nid_number": "1234567890",
    })
    assert extra_top_level.status_code == 422

    unknown_service = client.post("/api/services/does_not_exist/checklist", json={"task": "x", "answers": {}})
    assert unknown_service.status_code == 404


def test_service_documents_carry_source_and_review_date():
    response = client.post("/api/services/driving_licence/checklist", json={
        "task": "smart_card", "answers": {"professional": True},
    })
    assert response.status_code == 200
    documents = response.json()["documents"]
    assert documents
    for document in documents:
        assert document["source_url"].startswith("https://")
        assert document["last_verified"]
    assert any(document["id"] == "police_report" for document in documents)


def test_loader_rejects_invalid_contract():
    with pytest.raises(loader.ServiceContractError):
        loader._validate_service({"service_id": "x"}, "epassport")

    non_https = {
        "service_id": "demo", "service_name_bn": "ক", "service_name_en": "Demo",
        "authority_bn": "ক", "authority_en": "Authority", "summary_bn": "স", "summary_en": "s",
        "fallback_bn": "ফ", "fallback_en": "f", "source_url": "http://insecure.example",
        "last_verified": "2026-10-17", "official_links": [], "documents": [],
        "tasks": [{"id": "t", "label_bn": "ল", "label_en": "t", "questions": [],
                   "documents": [], "steps_bn": [], "steps_en": [], "warnings_bn": [], "warnings_en": []}],
    }
    with pytest.raises(loader.ServiceContractError):
        loader._validate_service(non_https, "demo")


def test_copilot_scopes_to_service_and_uses_service_fallback(monkeypatch):
    from app.rag import retriever

    monkeypatch.setattr(retriever, "retrieve", lambda *args, **kwargs: [])
    response = client.post("/api/copilot/ask", json={
        "question": "When is the NID correction possible?", "service_id": "nid", "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is False
    assert "services.nidw.gov.bd" in body["answer"]


def test_copilot_rejects_unknown_service_id():
    response = client.post("/api/copilot/ask", json={
        "question": "Hello there", "service_id": "does_not_exist",
    })
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SERVICE_NOT_FOUND"
