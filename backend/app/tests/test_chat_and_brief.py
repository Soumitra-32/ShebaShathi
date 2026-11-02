"""Conversational assistant, AI brief and model-fallback tests."""
import io
import json
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient

from app import llm
from app.main import app
from app.rag import brief, chat
from app.rag.prompts import plain_text

client = TestClient(app)


def _chunk() -> dict:
    return {
        "id": "source-chunk",
        "text": "The express fee for a 48-page, 10-year passport is 6325 BDT.",
        "score": 0.91,
        "metadata": {
            "section": "fees",
            "title": "Official fees",
            "source_url": "https://www.epassport.gov.bd/instructions/passport-fees",
            "last_verified": "2026-10-15",
        },
    }


def test_chat_returns_deterministic_fee_without_retrieval(monkeypatch):
    def _must_not_run(*args, **kwargs):  # pragma: no cover
        raise AssertionError("retrieval must not run for a deterministic fee answer")

    monkeypatch.setattr(chat, "retrieve", _must_not_run)
    response = client.post("/api/copilot/chat", json={
        "question": "48 pages 10 years express passport fee?",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is True
    assert body["generation_mode"] == "deterministic"
    assert body["service_id"] == "epassport"
    assert body["citations"][0]["url"].startswith("https://")
    assert body["suggested_questions"]
    assert "8050" in body["answer"]


def test_chat_generates_grounded_answer_with_citation(monkeypatch):
    monkeypatch.setattr(chat, "retrieve", lambda *args, **kwargs: [_chunk()])
    monkeypatch.setattr(chat.llm, "is_configured", lambda: True)
    monkeypatch.setattr(chat.llm, "provider_name", lambda: "openrouter")
    monkeypatch.setattr(chat, "_generate", lambda *args, **kwargs: {
        "answer": "The express fee is 6325 BDT for a 48-page, 10-year passport.",
        "used_chunk_ids": ["source-chunk"],
        "model": "anthropic/claude-sonnet-4.6",
    })
    response = client.post("/api/copilot/chat", json={
        "question": "Which documents do I need for a passport?",
        "language": "en",
        "service_id": "epassport",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is True
    assert body["generation_mode"] == "api"
    assert body["service_id"] == "epassport"
    assert body["citations"][0]["url"] == _chunk()["metadata"]["source_url"]
    assert body["llm_model"] == "anthropic/claude-sonnet-4.6"


def test_chat_rejects_identity_numbers_before_any_model_call(monkeypatch):
    def _must_not_run(*args, **kwargs):  # pragma: no cover
        raise AssertionError("the assistant must not run after a privacy rejection")

    monkeypatch.setattr(chat, "respond", _must_not_run)
    response = client.post("/api/copilot/chat", json={
        "question": "My NID is 1234567890, what is the fee?",
        "language": "en",
    })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "IDENTITY_DATA_REJECTED"


def test_chat_carries_service_scope_into_follow_up(monkeypatch):
    monkeypatch.setattr(chat, "retrieve", lambda *args, **kwargs: [_chunk()])
    monkeypatch.setattr(chat.llm, "is_configured", lambda: True)
    monkeypatch.setattr(chat.llm, "provider_name", lambda: "openrouter")
    captured = {}

    def fake_generate(question, history, language, docs):
        captured["history"] = history
        return {
            "answer": "The express fee is 6325 BDT.",
            "used_chunk_ids": ["source-chunk"],
            "model": "test-model",
        }

    monkeypatch.setattr(chat, "_generate", fake_generate)
    response = client.post("/api/copilot/chat", json={
        "question": "And which documents?",
        "history": [
            {"role": "user", "content": "I need a passport."},
            {"role": "assistant", "content": "Which delivery speed do you need?"},
        ],
        "service_id": "epassport",
        "language": "en",
    })
    assert response.status_code == 200
    assert captured["history"][0]["content"] == "I need a passport."
    assert response.json()["service_id"] == "epassport"


def test_plain_text_strips_markdown_formatting():
    assert plain_text("**Fee:** `6325` BDT\n## Steps") == "Fee: 6325 BDT\nSteps"
    assert plain_text("* First item\n* Second item") == "• First item\n• Second item"


def test_brief_is_deterministic_without_a_provider(monkeypatch):
    monkeypatch.setattr(brief.llm, "is_configured", lambda: False)
    response = client.post("/api/services/epassport/checklist/brief", json={
        "task": "first_time_adult",
        "answers": {"age": 25},
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "extractive"
    assert body["grounded"] is True
    assert body["source_url"].startswith("https://")
    assert "Documents:" in body["brief"]


def test_brief_rejects_unsupported_numbers_and_falls_back(monkeypatch):
    monkeypatch.setattr(brief.llm, "is_configured", lambda: True)
    monkeypatch.setattr(brief.llm, "completion", lambda *args, **kwargs: {
        "parsed": {"brief": "Pay 99999 taka and bring a magic document."},
        "model": "test-model",
    })
    response = client.post("/api/services/epassport/checklist/brief", json={
        "task": "first_time_adult",
        "answers": {"age": 25},
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "extractive"
    assert "99999" not in body["brief"]


class _Response:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_model_fallback_is_used_when_primary_is_unavailable(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_MODEL", "primary/model")
    monkeypatch.setenv("LLM_MODEL_FALLBACKS", "backup/model")
    calls = []

    def fake_urlopen(request, timeout=None):
        payload = json.loads(request.data.decode("utf-8"))
        calls.append(payload["model"])
        if payload["model"] == "primary/model":
            body = json.dumps({"error": {"message": "model not found"}}).encode("utf-8")
            raise HTTPError("https://provider.test", 404, "not found", {}, io.BytesIO(body))
        return _Response(json.dumps({
            "choices": [{"message": {"content": '{"ok": true}'}}],
        }).encode("utf-8"))

    monkeypatch.setattr(llm, "urlopen", fake_urlopen)
    response = llm.completion([{"role": "user", "content": "ping"}])
    assert calls == ["primary/model", "backup/model"]
    assert response["model"] == "backup/model"
    assert response["parsed"] == {"ok": True}


def test_model_fallback_is_used_when_primary_has_no_affordable_credit(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_MODEL", "expensive/model")
    monkeypatch.setenv("LLM_MODEL_FALLBACKS", "cheap/model")
    calls = []

    def fake_urlopen(request, timeout=None):
        payload = json.loads(request.data.decode("utf-8"))
        calls.append(payload["model"])
        if payload["model"] == "expensive/model":
            body = json.dumps({"error": {"message": "This request requires more credits"}}).encode("utf-8")
            raise HTTPError("https://provider.test", 402, "payment required", {}, io.BytesIO(body))
        return _Response(json.dumps({
            "choices": [{"message": {"content": '{"ok": true}'}}],
        }).encode("utf-8"))

    monkeypatch.setattr(llm, "urlopen", fake_urlopen)
    response = llm.completion([{"role": "user", "content": "ping"}])
    assert calls == ["expensive/model", "cheap/model"]
    assert response["model"] == "cheap/model"
