"""Privacy, unsafe-intent and rate-limit controls for public AI endpoints."""
from fastapi.testclient import TestClient

from app.main import app
from app.privacy import contains_identity_number
from app.rag import guard
from app.rate_limit import SlidingWindowLimiter


client = TestClient(app)


def test_identity_numbers_are_detected_but_short_answers_are_allowed():
    assert contains_identity_number("NID 1234567890") is True
    assert contains_identity_number("NID 1234 5678 90") is True
    assert contains_identity_number("passport number 123456789") is True
    assert contains_identity_number("P<BGDABCDE<<<<<<<<<<<<<<<<<<<<<<<<") is True
    assert contains_identity_number("my child is 5 years old") is False
    assert contains_identity_number("48 pages, 5 years, regular") is False


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


def test_copilot_rejects_identity_numbers():
    response = client.post("/api/copilot/ask", json={
        "question": "Check my NID 1234567890", "language": "en",
    })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "IDENTITY_DATA_REJECTED"


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
