"""Deterministic task steps are available on both copilot endpoints."""
from fastapi.testclient import TestClient

from app.main import app
from app.rag import retriever

client = TestClient(app)


def _ask(monkeypatch, question: str, service_id: str, language: str = "en"):
    def should_not_run(*args, **kwargs):
        raise AssertionError("deterministic steps must not retrieve")

    monkeypatch.setattr(retriever, "retrieve", should_not_run)
    response = client.post("/api/copilot/ask", json={
        "question": question,
        "service_id": service_id,
        "language": language,
    })
    assert response.status_code == 200
    return response.json()


def test_ask_returns_published_renewal_steps(monkeypatch):
    body = _ask(monkeypatch, "Renew expired driving licence?", "driving_licence")
    assert body["generation_mode"] == "deterministic"
    assert body["grounded"] is True
    assert "renew" in body["answer"].casefold()


def test_ask_returns_bangla_steps(monkeypatch):
    body = _ask(monkeypatch, "How do I renew a driving licence?", "driving_licence", "bn")
    assert body["generation_mode"] == "deterministic"
    assert body["grounded"] is True


def test_eligibility_question_is_not_replaced_by_steps():
    from app.rag import process_answer

    assert process_answer.answer(
        "Can I renew an expired driving licence without a medical certificate?",
        "driving_licence",
        "en",
    ) is None
