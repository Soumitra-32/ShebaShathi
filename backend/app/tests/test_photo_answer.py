"""Deterministic e-Passport photo-requirement answers."""
from fastapi.testclient import TestClient

from app.main import app
from app.rag import photo_answer


def test_adult_photo_answer_is_deterministic():
    result = photo_answer.answer("Adult paper photo needed?", "epassport", "en")
    assert result is not None
    assert result["generation_mode"] == "deterministic"
    assert "biometric" in result["answer"]
    assert "does not list" in result["answer"]
    assert result["citations"][0]["url"].startswith("https://")


def test_child_photo_answer_keeps_3r_requirement():
    result = photo_answer.answer("Under-six photo rule?", "epassport", "bn")
    assert result is not None
    assert "3R" in result["answer"]
    assert "ছবি" in result["answer"]


def test_ambiguous_photo_question_covers_both_groups():
    result = photo_answer.answer("Passport photo needed?", "epassport", "en")
    assert result is not None
    assert "adult" in result["answer"].lower()
    assert "child under six" in result["answer"].lower()


def test_photo_handler_does_not_cover_other_services_or_topics():
    assert photo_answer.answer("Adult paper photo needed?", "driving_licence", "en") is None
    assert photo_answer.answer("Passport fee?", "epassport", "en") is None


def test_endpoint_answers_photo_without_retrieval_or_llm(monkeypatch):
    from app.rag import generator, retriever

    def fail(*args, **kwargs):
        raise AssertionError("deterministic photo path must not call retrieval or the LLM")

    monkeypatch.setattr(generator, "generate", fail)
    monkeypatch.setattr(retriever, "retrieve", fail)
    response = TestClient(app).post(
        "/api/copilot/ask",
        json={
            "question": "Adult paper photo needed?",
            "service_id": "epassport",
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "deterministic"
    assert "biometric" in body["answer"]
    assert body["grounded"] is True
