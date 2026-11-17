"""Privacy, unsafe-intent and rate-limit controls for public AI endpoints."""
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import settings
from app.main import app
from app.privacy import contains_identity_number
from app.rag import guard
from app.rate_limit import SlidingWindowLimiter, client_key


client = TestClient(app)


def test_identity_numbers_are_detected_but_short_answers_are_allowed():
    assert contains_identity_number("NID 1234567890") is True
    assert contains_identity_number("NID 1234 5678 90") is True
    assert contains_identity_number("passport number 123456789") is True
    assert contains_identity_number("passport A01234567") is True
    assert contains_identity_number("P<BGDABCDE<<<<<<<<<<<<<<<<<<<<<<<<") is True
    assert contains_identity_number("my child is 5 years old") is False
    assert contains_identity_number("48 pages, 5 years, regular") is False


def test_sensitive_data_screen_adds_secret_terms():
    from app.privacy import contains_sensitive_data

    assert contains_sensitive_data("NID 1234567890") is True
    assert contains_sensitive_data("my password is hunter2") is True
    assert contains_sensitive_data("654321 is the code I received") is True
    assert contains_sensitive_data("code: 654321") is True
    assert contains_sensitive_data("654321") is True
    assert contains_sensitive_data("write to me at person@example.com") is True
    assert contains_sensitive_data("my otp did not arrive") is True
    assert contains_sensitive_data(  # Bangla secret terms are screened too
        "আমার পাসওয়ার্ড ভুলে গেছি"
    ) is True
    assert contains_sensitive_data("what is the passport fee?") is False
    assert contains_sensitive_data("") is False


def test_sensitive_questions_bypass_the_embedding_cache(monkeypatch):
    import numpy as np

    from app.rag import retriever

    calls = []

    class FakeEmbedder:
        def embed_query(self, text, use_cache=True):
            calls.append(use_cache)
            return np.zeros(2, dtype=np.float32)

        def embed(self, texts, task="query", use_cache=True):
            calls.append(use_cache)
            return np.zeros((len(texts), 2), dtype=np.float32)

    monkeypatch.setattr(retriever, "_embedder", lambda: FakeEmbedder())

    retriever.embed_query("NID 1234567890")
    retriever.embed_queries(["what is the passport fee?"])
    retriever.embed_queries(["NID 1234567890"])

    assert calls == [False, True, False]


def test_sensitive_data_screen_catches_names_addresses_and_document_shapes():
    from app.privacy import contains_sensitive_data

    assert contains_sensitive_data("My name is Rahim Ahmed") is True
    assert contains_sensitive_data("my full name: Rahim Ahmed") is True
    assert contains_sensitive_data("আমার নাম রহিম আহমেদ") is True
    assert contains_sensitive_data("পূর্ণ নাম: রহিম আহমেদ") is True
    assert contains_sensitive_data("নাম: রহিম আহমেদ") is True
    assert contains_sensitive_data("My address is House 12, Road 5, Dhaka") is True
    assert contains_sensitive_data("আমার ঠিকানা: বাসা ১২, রোড ৫, ঢাকা") is True
    assert contains_sensitive_data("Date of birth: 01/01/1990") is True
    assert contains_sensitive_data("I was born 01/01/1990") is True
    assert contains_sensitive_data("My child was born 2020-05-04") is True
    assert contains_sensitive_data("The deadline is 31/12/2027") is False
    assert contains_sensitive_data("licence no: DK-1234567") is True
    assert contains_sensitive_data(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    ) is True
    # Instructions and labels are not personal values.
    assert contains_sensitive_data("My name is wrong on my NID") is False
    assert contains_sensitive_data("name: correction procedure") is False
    assert contains_sensitive_data("নাম: সংশোধন পদ্ধতি") is False
    assert contains_sensitive_data("What is the address of the passport office?") is False
    assert contains_sensitive_data("Enter your date of birth on the form") is False


def test_assistant_history_screen_allows_public_numbers_but_catches_identity():
    from app.privacy import contains_sensitive_assistant_text

    assert contains_sensitive_assistant_text("The hotline is 16445 or 09666716445.") is False
    assert contains_sensitive_assistant_text("The official fee is 4025 BDT.") is False
    assert contains_sensitive_assistant_text("Delivery takes 15 days.") is False
    assert contains_sensitive_assistant_text("The NID 1234567890 was accepted.") is True
    assert contains_sensitive_assistant_text("Passport A01234567 is ready.") is True
    assert contains_sensitive_assistant_text("My name is Rahim Ahmed.") is True
    # An unlabelled 10+ digit value is still caught unless it is a published
    # public number, including a country-code form of the hotline.
    assert contains_sensitive_assistant_text("Reference 1234567890.") is True
    assert contains_sensitive_assistant_text("Call +880 9666-716445.") is False
    assert contains_sensitive_assistant_text("Verified on 2026-10-17.") is False


def test_sensitive_history_in_any_role_skips_the_provider():
    from app.rag import chat

    assert chat._screen_conversation(
        "what is the fee?",
        [{"role": "assistant", "content": "The NID 1234567890 was accepted."}],
    ) is True
    assert chat._screen_conversation(
        "what is the fee?",
        [{"role": "assistant", "content": "The official fee is 4025 BDT."}],
    ) is False


def test_guard_blocks_the_four_adversarial_categories():
    assert guard.classify("Which agent is fastest for passport?") == "intermediary"
    assert guard.classify("Bribe speeds passport?") == "bribe"
    assert guard.classify("Cash at passport counter?") == "cash_bypass"
    assert guard.classify("Biometric without passport?") == "biometric_bypass"


def test_guard_does_not_block_normal_fee_or_biometric_questions():
    assert guard.classify("How do I pay the passport fee?") is None
    assert guard.classify("Where is the biometric appointment?") is None
    assert guard.classify("What documents do I need?") is None


def test_copilot_blocks_unsafe_intent_before_retrieval(monkeypatch):
    from app.rag import retriever

    def should_not_run(*args, **kwargs):
        raise AssertionError("retrieval must not run for a blocked request")

    monkeypatch.setattr(retriever, "retrieve", should_not_run)
    response = client.post("/api/copilot/ask", json={
        "question": "Which agent is fastest for passport?", "service_id": "epassport", "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is False
    assert body["safety_blocked"] is True
    assert body["citations"] == []
    assert "agent" in body["answer"].lower()


def test_copilot_screens_sensitive_question_without_rejection(monkeypatch):
    monkeypatch.setattr("app.rag.retriever.retrieve", lambda *a, **k: [])
    response = client.post("/api/copilot/ask", json={
        "question": "Check my NID 1234567890", "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["grounded"] is False
    assert body["safety_blocked"] is True
    assert body["citations"] == []
    assert body["llm_provider"] == "none"


def test_rate_limiter_allows_the_limit_then_returns_retry_after():
    limiter = SlidingWindowLimiter(2, window_seconds=60, enabled=True)
    assert limiter.allow("client", now=100.0) == (True, 0)
    assert limiter.allow("client", now=101.0) == (True, 0)
    allowed, retry_after = limiter.allow("client", now=102.0)
    assert allowed is False
    assert retry_after > 0
    assert limiter.allow("other", now=102.0) == (True, 0)


def test_rate_limiter_can_be_disabled():
    limiter = SlidingWindowLimiter(1, enabled=False)
    for _ in range(10):
        assert limiter.allow("client") == (True, 0)


def test_sqlite_rate_limiter_is_shared_between_instances(tmp_path):
    import sqlite3

    path = tmp_path / "rate.sqlite"
    first = SlidingWindowLimiter(2, window_seconds=60, store_path=path, namespace="copilot")
    second = SlidingWindowLimiter(2, window_seconds=60, store_path=path, namespace="copilot")
    assert first.allow("client", now=100.0) == (True, 0)
    assert first.allow("client", now=101.0) == (True, 0)
    allowed, retry_after = second.allow("client", now=102.0)
    assert allowed is False
    assert retry_after > 0
    assert second.allow("client", now=161.0) == (True, 0)

    # The raw client key is hashed before storage.
    with sqlite3.connect(path) as connection:
        stored = [row[0] for row in connection.execute("SELECT key FROM rate_limit_hits")]
    assert stored and all("client" not in key for key in stored)

    second.reset()
    assert first.allow("client", now=200.0) == (True, 0)


def test_sqlite_rate_limiter_namespaces_do_not_share_a_budget(tmp_path):
    path = tmp_path / "rate.sqlite"
    copilot = SlidingWindowLimiter(1, window_seconds=60, store_path=path, namespace="copilot")
    intake = SlidingWindowLimiter(1, window_seconds=60, store_path=path, namespace="intake")
    assert copilot.allow("client", now=100.0) == (True, 0)
    assert copilot.allow("client", now=101.0)[0] is False
    assert intake.allow("client", now=101.0) == (True, 0)


def _request(peer: str, forwarded: str | None = None) -> Request:
    headers = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request({"type": "http", "client": (peer, 1234), "headers": headers})


def test_client_key_ignores_forwarded_header_by_default(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_key(_request("10.0.0.5", "203.0.113.9")) == "10.0.0.5"


def test_client_key_uses_the_rightmost_untrusted_forwarded_address(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    monkeypatch.setattr(settings, "trusted_proxy_ips", ["10.0.0.0/8"])
    # A client-supplied left value must not choose its own bucket.
    assert client_key(_request("10.0.0.5", "198.51.100.7, 203.0.113.9")) == "203.0.113.9"
    # A direct peer outside the trusted proxy network is never overridden.
    assert client_key(_request("192.0.2.4", "203.0.113.9")) == "192.0.2.4"
    # An unparseable direct peer (for example a test transport) is also not
    # allowed to borrow a forwarded identity when an allowlist is configured.
    assert client_key(_request("testclient", "203.0.113.9")) == "testclient"


def test_redis_rate_limit_store_uses_the_atomic_script(monkeypatch):
    calls = []

    def fake_script(keys, args):
        calls.append((keys, args))
        return [0, 7]

    limiter = SlidingWindowLimiter(5, redis_prefix="test-prefix", namespace="copilot")
    limiter._redis = object()
    limiter._redis_script = fake_script
    allowed, retry_after = limiter.allow("203.0.113.9", now=100.0)
    assert (allowed, retry_after) == (False, 7)
    assert calls[0][0][0].startswith("test-prefix:copilot:")
    assert "203.0.113.9" not in calls[0][0][0]


def test_broken_redis_rate_limit_store_degrades_to_memory(monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("no redis")

    monkeypatch.setattr(SlidingWindowLimiter, "_init_redis", broken)
    limiter = SlidingWindowLimiter(1, redis_url="redis://example.invalid:6379/0")
    assert limiter._redis is None
    assert limiter.allow("client") == (True, 0)
    assert limiter.allow("client")[0] is False
