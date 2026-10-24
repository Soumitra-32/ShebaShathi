"""Offline RAG eval (PLANNER §13.2): 30 questions, no model download."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.rag import generator, retriever, verifier

client = TestClient(app)
EVAL_FILE = Path(__file__).with_name("eval_questions.json")


def _load():
    return json.loads(EVAL_FILE.read_text(encoding="utf-8"))["questions"]


def test_eval_set_shape_matches_planner():
    questions = _load()
    assert len(questions) == 30
    counts: dict[str, int] = {}
    for item in questions:
        counts[item["category"]] = counts.get(item["category"], 0) + 1
    assert counts == {
        "fees": 5, "documents": 8, "minors": 4,
        "renewal_lost": 4, "payment": 3, "photo": 2, "trick": 4,
    }
    for item in questions:
        assert item["expected"] in ("answer", "fallback")
        assert len(item["question"]) >= 2


def _chunk_for(item):
    text = " ".join(item["must_contain"]) + " per official guidance."
    return {"id": f"eval-{item['id']}", "text": text, "score": 0.9,
            "metadata": {"section": item["expected_source_section"] or "documents",
                         "title": "Eval fixture",
                         "source_url": "https://www.epassport.gov.bd/",
                         "last_verified": "2026-10-17"}}


def test_answer_items_ground_with_mocked_retrieval(monkeypatch):
    questions = [q for q in _load() if q["expected"] == "answer"]
    assert len(questions) == 26
    seen_service: list[str] = []

    def fake_retrieve(question, top_k=None, min_score=None, service_id=None):
        seen_service.append(service_id)
        item = next(q for q in questions if q["question"] == question)
        return [_chunk_for(item)]

    monkeypatch.setattr(retriever, "retrieve", fake_retrieve)
    monkeypatch.setattr(generator.llm, "is_configured", lambda: False)
    for item in questions:
        response = client.post("/api/copilot/ask", json={
            "question": item["question"], "service_id": item["service_id"],
            "language": item["language"]})
        assert response.status_code == 200
        body = response.json()
        assert body["grounded"] is True, item["id"]
        normalised_answer = body["answer"].translate(str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789"))
        for token in item["must_contain"]:
            aliases = {"fee": ("fee", "ফি")}.get(token, (token,))
            assert any(alias in normalised_answer for alias in aliases), item["id"]
    assert set(seen_service) >= {"epassport", "nid"}


def test_trick_items_use_safe_fallback(monkeypatch):
    questions = [q for q in _load() if q["expected"] == "fallback"]
    assert len(questions) == 4
    monkeypatch.setattr(retriever, "retrieve", lambda *a, **k: [])
    for item in questions:
        response = client.post("/api/copilot/ask", json={
            "question": item["question"], "service_id": item["service_id"],
            "language": item["language"]})
        assert response.status_code == 200
        assert response.json()["grounded"] is False, item["id"]


def test_verifier_still_rejects_unsupported_numbers():
    chunk = _chunk_for(_load()[0])
    bad = {"answer": "Fee is 999999 taka.", "used_chunk_ids": [chunk["id"]],
           "retrieved_chunks": [chunk]}
    assert verifier.verify(bad)["grounded"] is False
