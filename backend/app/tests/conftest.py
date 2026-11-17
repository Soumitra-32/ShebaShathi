"""Shared test isolation.

The public AI endpoints use a sliding-window limiter. Tests make many requests
from the same client address, so each test starts with an empty window; the
limiter itself is exercised directly in ``test_privacy_guard.py``. The semantic
relevance fallback would load the embedding model for every deliberately
off-topic test question, so it is disabled by default; its unit tests enable it
with a fake embedder and the chat tests inject the decision explicitly.
"""
import pytest

from app.config import settings
from app.main import copilot_limiter, intake_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    copilot_limiter.reset()
    intake_limiter.reset()
    yield
    copilot_limiter.reset()
    intake_limiter.reset()


@pytest.fixture(autouse=True)
def disable_semantic_scope(monkeypatch):
    monkeypatch.setattr(settings, "semantic_scope_enabled", False)
