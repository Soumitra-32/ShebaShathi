"""Deterministic fee-answer tests.

The language model must never be the authority for a fee tier. These tests pin
the exact published totals and prove that the fee handler answers without
retrieval or generation.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.rag import fee_answer


def test_epassport_fee_tiers_are_exact():
    cases = [
        ("48 page 5 year regular fee koto?", "4025"),
        ("Express fee for 48-page 10-year passport?", "8050"),
        ("64 page 10 year super express fee?", "13800"),
    ]
    for question, expected in cases:
        result = fee_answer.answer(question, "epassport", "en")
        assert result is not None
        assert result["generation_mode"] == "deterministic"
        assert expected in result["answer"]
        assert result["grounded"] is True
        assert result["citations"][0]["url"].startswith("https://")


def test_bangla_fee_question_and_digits():
    result = fee_answer.answer(
        "৪৮ পৃষ্ঠা, ৫ বছর, সাধারণ ডেলিভারি ফি কত?", "epassport", "bn"
    )
    assert result is not None
    assert "৪০২৫" in result["answer"]
    assert "যাচাই" in result["answer"]


def test_driving_renewal_fee():
    result = fee_answer.answer(
        "Driving licence renewal non-professional fee?", "driving_licence", "en"
    )
    assert result is not None
    assert "2185" in result["answer"]


def test_non_amount_questions_are_not_intercepted():
    for question in (
        "Regular delivery time after biometrics?",
        "Online fee payment channels?",
        "Bank A-Challan fee payment?",
        "Adult paper photo needed?",
    ):
        assert fee_answer.answer(question, "epassport", "en") is None


def test_fee_verification_points_to_official_page():
    result = fee_answer.answer("Licence fee verify how?", "driving_licence", "bn")
    assert result is not None
    assert result["generation_mode"] == "deterministic"
    assert "bsp.brta.gov.bd" in result["answer"]
    assert "ফি" in result["answer"]
    assert result["citations"][0]["last_verified"]


def test_missing_parameters_ask_for_them_instead_of_guessing():
    result = fee_answer.answer("Passport fee?", "epassport", "en")
    assert result is not None
    assert "pages" in result["answer"]
    assert "4025" not in result["answer"]


def test_endpoint_answers_fee_without_retrieval_or_llm(monkeypatch):
    from app.rag import generator, retriever

    def fail(*args, **kwargs):
        raise AssertionError("deterministic fee path must not call retrieval or the LLM")

    monkeypatch.setattr(generator, "generate", fail)
    monkeypatch.setattr(retriever, "retrieve", fail)
    client = TestClient(app)
    response = client.post(
        "/api/copilot/ask",
        json={
            "question": "Express fee for 48-page 10-year passport?",
            "service_id": "epassport",
            "language": "en",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "deterministic"
    assert "8050" in body["answer"]
    assert body["grounded"] is True
