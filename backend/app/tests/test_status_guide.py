"""Status-guide data contract, endpoint and deterministic status answers."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import guidance
from app.guidance import loader as guidance_loader
from app.main import app
from app.rag import status_answer
from app.rag.generator import generate as generator_generate
from app.rag.retriever import retrieve as retriever_retrieve

# ---------------------------------------------------------------------------
# Data contract


def test_epassport_guide_loads_and_has_every_section():
    guide = guidance.get_guide("epassport")
    assert guide["service_id"] == "epassport"
    assert len(guide["statuses"]) >= 5
    assert guide["tips"] and guide["diaspora"]["items"] and guide["fraud_warnings"]
    assert guide["freshness"]["status"] in {"fresh", "due_soon", "stale", "unknown"}
    for status in guide["statuses"]:
        assert status["label"] and status["meaning_bn"] and status["meaning_en"]
        assert status["action_bn"] and status["action_en"]
        assert status["source_url"].startswith("https://")
        assert status["last_verified"]


def test_unknown_service_has_no_guide():
    with pytest.raises(KeyError):
        guidance.get_guide("birth_registration")


def test_contract_fails_closed_on_bad_source_url(tmp_path: Path, monkeypatch):
    bad = json.loads((Path(guidance_loader.GUIDANCE_DIR) / "epassport.json").read_text(encoding="utf-8"))
    bad["source_url"] = "http://insecure.example/"
    file = tmp_path / "bad.json"
    file.write_text(json.dumps(bad), encoding="utf-8")
    loaded = json.loads(file.read_text(encoding="utf-8"))
    with pytest.raises(guidance_loader.GuidanceContractError):
        guidance_loader._validate_guide(loaded, "bad")


def test_contract_fails_closed_on_missing_meaning(tmp_path: Path):
    bad = json.loads((Path(guidance_loader.GUIDANCE_DIR) / "epassport.json").read_text(encoding="utf-8"))
    del bad["statuses"][0]["meaning_en"]
    with pytest.raises(guidance_loader.GuidanceContractError):
        guidance_loader._validate_guide(bad, "bad")


def test_contract_fails_closed_on_unexpected_key(tmp_path: Path):
    bad = json.loads((Path(guidance_loader.GUIDANCE_DIR) / "epassport.json").read_text(encoding="utf-8"))
    bad["mystery_key"] = "value"
    with pytest.raises(guidance_loader.GuidanceContractError):
        guidance_loader._validate_guide(bad, "bad")


# ---------------------------------------------------------------------------
# Deterministic status answers


def test_sb_clearance_answer_is_grounded_and_deterministic():
    result = status_answer.answer("Why is my status Pending for SB Police Clearance?", "epassport", "en")
    assert result is not None
    assert result["generation_mode"] == "deterministic"
    assert result["grounded"] is True
    assert "SB/CSB/DSB" in result["answer"]
    assert "Hello SB" in result["answer"]
    citation = result["citations"][0]
    assert citation["url"] == "https://specialbranch.gov.bd/nodes/view/22"
    assert citation["last_verified"]


def test_sb_clearance_answer_works_in_bangla():
    result = status_answer.answer("স্ট্যাটাসে Pending for SB Police Clearance দেখাচ্ছে, কী করব?", "epassport", "bn")
    assert result is not None
    assert "এসবি" in result["answer"]
    assert "Hello SB" in result["answer"]


def test_print_queue_answer_directs_to_passport_office():
    result = status_answer.answer("passport status says pending in print queue", None, "en")
    assert result is not None
    assert "passport office" in result["answer"].lower()


def test_generic_status_question_returns_how_to_check():
    result = status_answer.answer("How do I check my passport application status?", None, "en")
    assert result is not None
    assert "Application ID" in result["answer"] or "OID" in result["answer"]
    assert result["citations"][0]["url"].startswith("https://")


def test_hotline_question_returns_official_numbers():
    result = status_answer.answer("What is the passport helpline number?", "epassport", "bn")
    assert result is not None
    assert "১৬৪৪৫" in result["answer"]
    assert "০৯৬৬৬৭১৬৪৪৫" in result["answer"]


def test_status_handler_stays_out_of_other_topics_and_services():
    assert status_answer.answer("How do I renew my driving licence?", None, "en") is None
    assert status_answer.answer("What is the passport fee for 48 pages?", "epassport", "en") is None
    assert status_answer.answer("Tell me about driving licence status", "driving_licence", "en") is None


def test_copilot_answers_status_without_retrieval_or_llm(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("deterministic status path must not call retrieval or the LLM")

    monkeypatch.setattr("app.rag.generator.generate", fail)
    monkeypatch.setattr("app.rag.retriever.retrieve", fail)
    response = TestClient(app).post(
        "/api/copilot/ask",
        json={"question": "My status shows backend verification, what now?", "service_id": "epassport", "language": "en"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "deterministic"
    assert body["grounded"] is True
    assert body["llm_provider"] == "none"


# ---------------------------------------------------------------------------
# Endpoint


def test_status_guide_endpoint_serves_content():
    response = TestClient(app).get("/api/services/epassport/status-guide")
    assert response.status_code == 200
    body = response.json()
    assert body["service_id"] == "epassport"
    assert len(body["statuses"]) >= 5
    assert body["how_to_check"]["text_en"]
    assert all(w["source_url"].startswith("https://") for w in body["fraud_warnings"])


def test_status_guide_endpoint_404_for_services_without_guidance():
    response = TestClient(app).get("/api/services/nid/status-guide")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GUIDANCE_NOT_FOUND"
