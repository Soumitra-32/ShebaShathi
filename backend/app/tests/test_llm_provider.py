"""Tests for the optional OpenAI-compatible LLM adapter (OpenRouter, OpenAI, ...)."""
import io
import json
from urllib.error import HTTPError

import pytest

from app import llm


class _Response:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _ok(content: str) -> _Response:
    body = {"choices": [{"message": {"content": content}}], "usage": {"total_tokens": 12}}
    return _Response(json.dumps(body).encode("utf-8"))


def _error(status: int, message: str) -> HTTPError:
    body = json.dumps({"error": {"message": message, "code": status}}).encode("utf-8")
    return HTTPError("https://provider.test", status, message, {}, io.BytesIO(body))


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_BASE", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("LLM_APP_TITLE", raising=False)
    monkeypatch.delenv("LLM_HTTP_REFERER", raising=False)


def test_no_key_means_no_llm_call(monkeypatch):
    assert llm.is_configured() is False
    assert llm.provider_name() == "none"
    assert llm.describe_provider()["configured"] is False

    def _fail(*args, **kwargs):  # pragma: no cover - must never run
        raise AssertionError("the provider must not be called without a key")

    monkeypatch.setattr(llm, "urlopen", _fail)
    with pytest.raises(llm.LLMProviderError):
        llm.completion([{"role": "user", "content": "hello"}])


def test_openrouter_endpoint_headers_and_model(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-or-test-key")
    monkeypatch.setenv("LLM_API_BASE", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("LLM_MODEL", "anthropic/claude-3.5-sonnet")
    monkeypatch.setenv("LLM_APP_TITLE", "ShebaShathi BD")
    monkeypatch.setenv("LLM_HTTP_REFERER", "https://example.org")

    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        captured["headers"] = {key.lower(): value for key, value in request.headers.items()}
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return _ok(json.dumps({"answer": "ঠিক আছে", "used_chunk_ids": ["c1"]}))

    monkeypatch.setattr(llm, "urlopen", fake_urlopen)

    response = llm.completion([{"role": "user", "content": "পাসপোর্টের ফি?"}])

    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["payload"]["model"] == "anthropic/claude-3.5-sonnet"
    assert captured["payload"]["response_format"] == {"type": "json_object"}
    assert captured["headers"]["authorization"] == "Bearer sk-or-test-key"
    assert captured["headers"]["http-referer"] == "https://example.org"
    assert captured["headers"]["x-title"] == "ShebaShathi BD"
    assert captured["timeout"] == llm.REQUEST_TIMEOUT_SECONDS
    assert json.loads(response["content"])["answer"] == "ঠিক আছে"
    assert llm.provider_name() == "openrouter"
    assert llm.describe_provider() == {
        "provider": "openrouter",
        "model": "anthropic/claude-3.5-sonnet",
        "configured": True,
    }


def test_openai_provider_is_detected(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_API_BASE", "https://api.openai.com/v1")
    assert llm.provider_name() == "openai"


def test_generic_openai_compatible_provider_is_detected(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_API_BASE", "https://llm.internal/v1")
    assert llm.provider_name() == "openai-compatible"


def test_missing_json_mode_support_triggers_one_retry(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-or-test-key")
    monkeypatch.setenv("LLM_API_BASE", "https://openrouter.ai/api/v1")

    calls = []

    def fake_urlopen(request, timeout=None):
        payload = json.loads(request.data.decode("utf-8"))
        calls.append(payload)
        if "response_format" in payload:
            raise _error(400, "This model does not support response_format")
        return _ok('```json\n{"answer": "ok", "used_chunk_ids": []}\n```')

    monkeypatch.setattr(llm, "urlopen", fake_urlopen)

    response = llm.completion([{"role": "user", "content": "hi"}])

    assert len(calls) == 2
    assert "response_format" not in calls[1]
    assert json.loads(response["content"]) == {"answer": "ok", "used_chunk_ids": []}


@pytest.mark.parametrize(
    "status,expected",
    [
        (401, "rejected the API key"),
        (402, "no credit left"),
        (429, "rate-limiting"),
        (500, "not available right now"),
    ],
)
def test_provider_errors_are_sanitised(monkeypatch, status, expected):
    monkeypatch.setenv("LLM_API_KEY", "sk-or-secret-key")
    monkeypatch.setenv("LLM_API_BASE", "https://openrouter.ai/api/v1")

    def fake_urlopen(request, timeout=None):
        raise _error(status, "provider detail")

    monkeypatch.setattr(llm, "urlopen", fake_urlopen)

    with pytest.raises(llm.LLMProviderError) as failure:
        llm.completion([{"role": "user", "content": "hi"}])

    message = str(failure.value)
    assert expected in message
    assert "sk-or-secret-key" not in message


def test_invalid_json_from_the_provider_is_reported(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_API_BASE", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(llm, "urlopen", lambda request, timeout=None: _ok("not json at all"))
    with pytest.raises(llm.LLMProviderError):
        llm.completion([{"role": "user", "content": "hi"}])


def test_empty_choices_are_reported(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_API_BASE", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(llm, "urlopen", lambda request, timeout=None: _Response(b'{"choices": []}'))
    with pytest.raises(llm.LLMProviderError):
        llm.completion([{"role": "user", "content": "hi"}])


def test_the_api_key_is_never_returned_by_describe_provider(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-or-secret-key")
    described = llm.describe_provider()
    assert "sk-or-secret-key" not in json.dumps(described)


def test_copilot_response_reports_the_provider_and_model(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.rag import generator, retriever

    chunk = {
        "id": "source-chunk", "text": "Express fee is 6325 taka.", "score": 0.91,
        "metadata": {"section": "fees", "title": "Official fees",
                     "source_url": "https://www.epassport.gov.bd/instructions/passport-fees",
                     "last_verified": "2026-10-15"},
    }
    monkeypatch.setattr(retriever, "retrieve", lambda *args, **kwargs: [chunk])
    monkeypatch.setattr(generator, "generate", lambda *args, **kwargs: {
        "answer": chunk["text"], "used_chunk_ids": [chunk["id"]],
        "retrieved_chunks": [chunk], "generation_mode": "api",
        "llm_provider": "openrouter", "llm_model": "anthropic/claude-3.5-sonnet",
    })

    response = TestClient(app).post("/api/copilot/ask", json={"question": "Express fee?", "language": "en"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["llm_provider"] == "openrouter"
    assert payload["llm_model"] == "anthropic/claude-3.5-sonnet"
    assert "sk-or-secret-key" not in json.dumps(payload)


def test_health_reports_the_provider_without_the_key(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    monkeypatch.setenv("LLM_API_KEY", "sk-or-secret-key")
    monkeypatch.setenv("LLM_API_BASE", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("LLM_MODEL", "anthropic/claude-3.5-sonnet")

    payload = TestClient(app).get("/health").json()
    assert payload["llm_provider"] == "openrouter"
    assert payload["llm_model"] == "anthropic/claude-3.5-sonnet"
    assert "sk-or-secret-key" not in json.dumps(payload)
