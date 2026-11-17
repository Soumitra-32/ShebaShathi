"""Hardening tests: semantic scope, deterministic documents, extractive support."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.rag import chat, documents_answer, generator, process_answer, relevance
from app.rag.extractive import supported_excerpt

client = TestClient(app)


def _chunk(text: str, score: float = 0.91, section: str = "documents") -> dict:
    return {
        "id": "chunk-1",
        "text": text,
        "score": score,
        "metadata": {
            "section": section,
            "title": "Official source",
            "source_url": "https://example.gov.bd/source",
            "last_verified": "2026-10-17",
        },
    }


def test_semantic_scope_uses_a_margin_not_a_single_threshold(monkeypatch):
    monkeypatch.setattr(settings, "semantic_scope_enabled", True)
    matrix = np.asarray([
        [1.0, 0.0], [0.99, 0.1], [0.98, 0.2],
        [0.0, 1.0], [-0.2, 0.98], [-0.1, 0.99],
    ], dtype=np.float32)
    monkeypatch.setattr(relevance, "_scope_matrix", lambda: (matrix, 3))
    monkeypatch.setattr(
        "app.rag.retriever.embed_queries",
        lambda texts: np.asarray([[1.0, 0.0]], dtype=np.float32),
    )
    assert relevance.semantic_in_scope("a paraphrase with no catalog words") is True

    monkeypatch.setattr(
        "app.rag.retriever.embed_queries",
        lambda texts: np.asarray([[0.0, 1.0]], dtype=np.float32),
    )
    assert relevance.semantic_in_scope("an unrelated question") is False


def test_bangla_how_to_and_delivery_questions_select_the_right_section():
    from app.rag.retriever import infer_section

    assert infer_section("পাসপোর্টের জন্য কীভাবে আবেদন করব?") == "process"
    assert infer_section("How long does normal delivery take?") == "fees"
    chunk = _chunk("Regular delivery: within 15 working days.", section="fees")
    assert supported_excerpt("How long does normal delivery take?", [chunk]) is not None


def test_semantic_scope_embeds_prototypes_as_passages(monkeypatch):
    monkeypatch.setattr(settings, "semantic_scope_enabled", True)
    seen: dict[str, list[str]] = {}

    def fake_passages(texts):
        seen["texts"] = list(texts)
        return np.zeros((len(texts), 2), dtype=np.float32)

    monkeypatch.setattr("app.rag.retriever.embed_passages", fake_passages)
    relevance.reset_semantic_scope()
    matrix, split = relevance._scope_matrix()
    assert seen["texts"] == [*relevance._SCOPE_IN_EXAMPLES, *relevance._SCOPE_OUT_EXAMPLES]
    assert matrix.shape == (split + len(relevance._SCOPE_OUT_EXAMPLES), 2)
    assert split == len(relevance._SCOPE_IN_EXAMPLES)


def test_semantic_calibration_includes_hard_off_topic_negatives():
    joined = " ".join(relevance._SCOPE_OUT_EXAMPLES).casefold()
    assert "trade licence" in joined
    assert "police clearance" in joined
    assert "student visa" in joined
    assert "bank account" in joined
    assert "marriage" in joined


def test_semantic_scope_fails_closed_when_the_embedder_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "semantic_scope_enabled", True)
    monkeypatch.setattr(
        "app.rag.retriever.embed_queries",
        lambda texts: (_ for _ in ()).throw(RuntimeError("no model")),
    )
    assert relevance.semantic_scores("anything") == (0.0, 0.0)
    assert relevance.semantic_in_scope("anything") is False


def test_process_tool_answers_a_renewal_paraphrase():
    result = process_answer.answer("Renew expired driving licence?", "driving_licence", "en")
    assert result is not None
    assert result["generation_mode"] == "deterministic"
    assert result["answer_found"] is True
    assert "Driving licence renewal" in result["answer"]
    assert result["citations"][0]["url"].startswith("https://")


def test_chat_uses_semantic_fallback_for_a_paraphrase(monkeypatch):
    monkeypatch.setattr(chat, "semantic_in_scope", lambda question: True)
    monkeypatch.setattr(chat, "retrieve", lambda *a, **k: [_chunk("Renewal rules are here.")])
    monkeypatch.setattr(chat.llm, "is_configured", lambda: False)
    response = client.post("/api/copilot/chat", json={
        "question": "I need the little blue travel book",
        "service_id": "epassport",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is True
    assert body["generation_mode"] == "extractive"


def test_process_tool_answers_a_child_passport_request_without_retrieval(monkeypatch):
    def must_not_retrieve(*args, **kwargs):  # pragma: no cover
        raise AssertionError("a named task must be answered deterministically")

    monkeypatch.setattr(chat, "retrieve", must_not_retrieve)
    response = client.post("/api/copilot/chat", json={
        "question": "I need the little blue travel book for my infant",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "deterministic"
    assert body["answer_found"] is True
    assert body["service_id"] == "epassport"
    assert "Child application" in body["answer"]
    assert "Complete the child's new application" in body["answer"]
    assert body["citations"][0]["url"].startswith("https://")


def test_process_tool_answers_in_the_requested_language():
    result = process_answer.answer(
        "আমার সন্তানের পাসপোর্ট কীভাবে নেব?",
        "epassport",
        "bn",
    )
    assert result is not None
    assert "শিশুর আবেদন" in result["answer"]
    assert "Published steps" not in result["answer"]


def test_process_tool_declines_an_explicit_eligibility_request():
    assert process_answer.answer(
        "I need to know if my child can get a passport without a birth certificate",
        "epassport",
        "en",
    ) is None


def test_process_tool_leaves_an_eligibility_question_to_retrieval(monkeypatch):
    monkeypatch.setattr(chat, "retrieve", lambda *a, **k: [_chunk("A birth certificate is required.")])
    monkeypatch.setattr(chat.llm, "is_configured", lambda: False)
    response = client.post("/api/copilot/chat", json={
        "question": "Can my child get a passport without a birth certificate?",
        "service_id": "epassport",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "extractive"
    assert "Published steps" not in body["answer"]


def test_chat_rejects_a_paraphrase_when_semantic_scope_also_fails(monkeypatch):
    monkeypatch.setattr(chat, "semantic_in_scope", lambda question: False)
    response = client.post("/api/copilot/chat", json={
        "question": "I need the small blue document for my infant",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is False
    assert body["answer_found"] is False
    assert body["generation_mode"] == "not_found"


def test_documents_tool_answers_from_service_data():
    result = documents_answer.answer("What documents do I need for a passport?", None, "en")
    assert result is not None
    assert result["generation_mode"] == "deterministic"
    assert result["grounded"] is True
    assert "National ID" in result["answer"]
    assert "Previous passport" in result["answer"]
    assert result["citations"][0]["url"].startswith("https://")

    renewal = documents_answer.answer("Which documents for passport renewal?", None, "en")
    assert renewal is not None
    assert "Previous passport" in renewal["answer"]

    under_five = documents_answer.answer("Under-5 birth registration proof?", None, "en")
    assert under_five is not None
    assert "EPI" in under_five["answer"]


def test_documents_tool_does_not_guess_a_service():
    assert documents_answer.answer("What documents do I need?", None, "en") is None


def test_documents_tool_serves_the_api_without_retrieval(monkeypatch):
    def should_not_run(*args, **kwargs):
        raise AssertionError("document tool must not retrieve")

    monkeypatch.setattr("app.rag.retriever.retrieve", should_not_run)
    response = client.post("/api/copilot/ask", json={
        "question": "Which documents for passport renewal?",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "deterministic"
    assert body["grounded"] is True
    assert body["answer_found"] is True
    assert body["retrieved_chunks"] == []


def test_extractive_support_rejects_a_chunk_that_shares_only_a_service_word():
    docs = [_chunk("The passport office is closed on Friday.", score=0.50)]
    assert supported_excerpt("How do I correct my birth certificate name?", docs) is None


def test_extractive_support_accepts_a_task_word_or_a_high_score():
    by_word = [_chunk("The previous passport must be submitted for renewal.", score=0.55)]
    assert supported_excerpt("What is needed for renewal?", by_word) is not None

    paraphrase = [_chunk("The verified source describes this process.", score=0.91)]
    assert supported_excerpt("How can I do this?", paraphrase) is not None


def test_extractive_support_prefers_the_asked_section():
    docs = [
        _chunk("The fee is 4025 taka.", score=0.92, section="fees"),
        _chunk("The required document is the previous passport.", score=0.80, section="documents"),
    ]
    chosen = supported_excerpt("Which documents are required?", docs)
    assert chosen is not None
    assert chosen["metadata"]["section"] == "documents"


def test_generator_marks_an_unsupported_excerpt_not_answerable():
    result = generator._extractive_answer(
        "How do I correct my birth certificate name?",
        [_chunk("The passport office is closed on Friday.", score=0.50)],
        "en",
    )
    assert result["answerable"] is False
    assert result["answer"] == ""


def test_chat_does_not_show_an_unsupported_excerpt(monkeypatch):
    monkeypatch.setattr(chat, "retrieve", lambda *a, **k: [
        _chunk("The passport office is closed on Friday.", score=0.50)
    ])
    monkeypatch.setattr(chat.llm, "is_configured", lambda: False)
    response = client.post("/api/copilot/chat", json={
        "question": "Is a birth certificate name correction allowed?",
        "service_id": "birth_registration",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is False
    assert body["answer_found"] is False
    assert body["citations"] == []
    assert body["retrieved_chunks"] == []


def test_rate_limit_path_resolves_against_the_repository(monkeypatch):
    from app import config

    monkeypatch.setenv("RATE_LIMIT_DB_PATH", ".state/test-rate.sqlite")
    expected = config.PROJECT_ROOT / ".state" / "test-rate.sqlite"
    assert config._resolve_rate_limit_db_path() == str(expected)


def test_broken_rate_limit_store_degrades_to_memory(tmp_path):
    from app.rate_limit import SlidingWindowLimiter

    broken = tmp_path / "not-a-file"
    broken.mkdir()
    limiter = SlidingWindowLimiter(1, store_path=broken, namespace="test")
    assert limiter.store_path is None
    assert limiter.allow("client") == (True, 0)
    assert limiter.allow("client")[0] is False
