"""Deterministic e-Passport payment-channel answers."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.rag import payment_answer, retriever

client = TestClient(app)
DATA = json.loads((Path(__file__).resolve().parents[3] / "data" / "requirements.json").read_text(encoding="utf-8"))


def test_english_payment_question_lists_every_published_channel():
    result = payment_answer.answer("Pay fee with ShurjoPay?", "epassport", "en")
    assert result is not None
    assert result["generation_mode"] == "deterministic"
    assert result["grounded"] is True
    for channel in DATA["payment_channels"]:
        assert channel["label_en"] in result["answer"]
    assert result["citations"][0]["url"] == DATA["payment_channels"][0]["source_url"]


def test_bangla_payment_question_uses_bangla_labels():
    result = payment_answer.answer("পেমেন্ট চ্যানেল কোনগুলো?", "epassport", "bn")
    assert result is not None
    for channel in DATA["payment_channels"]:
        assert channel["label_bn"] in result["answer"]
    assert result["generation_mode"] == "deterministic"


def test_payment_answer_is_scoped_to_epassport():
    assert payment_answer.answer("Pay fee with ShurjoPay?", "nid", "en") is None
    assert payment_answer.answer("What documents do I need?", "epassport", "en") is None
    assert payment_answer.answer(
        "What documents do I need to pay the fee?", "epassport", "en"
    ) is None
    assert payment_answer.answer("Which papers are required for payment?", "epassport", "en") is None


def test_english_payment_paraphrases_are_deterministic():
    questions = [
        "Is there an online payment option?",
        "Can I pay by card?",
        "Which bank should I use for the fee?",
        "Can I pay at a bank counter?",
        "Do you accept mobile banking?",
        "Where do I pay the fee?",
        "What is the payment gateway?",
        "How can I pay through ShurjoPay?",
    ]
    for question in questions:
        result = payment_answer.answer(question, "epassport", "en")
        assert result is not None, question
        assert result["generation_mode"] == "deterministic"
        for channel in DATA["payment_channels"]:
            assert channel["label_en"] in result["answer"]


def test_bangla_payment_paraphrases_are_deterministic():
    questions = [
        "অনলাইন পেমেন্ট আছে?",
        "ব্যাংকে ফি পরিশোধ করা যাবে?",
        "কার্ডে টাকা দেওয়া যাবে?",
        "মোবাইল ব্যাংকিং দিয়ে ফি দেওয়ার উপায় কী?",
    ]
    for question in questions:
        result = payment_answer.answer(question, "epassport", "bn")
        assert result is not None, question
        for channel in DATA["payment_channels"]:
            assert channel["label_bn"] in result["answer"]


def test_document_questions_are_not_taken_over_by_the_payment_tool():
    questions = [
        "What documents do I need to pay the fee?",
        "Which papers are required for the payment?",
        "ফি দেওয়ার জন্য কোন কাগজপত্র লাগবে?",
        "পেমেন্টের নথি কী কী?",
    ]
    for question in questions:
        assert payment_answer.answer(question, "epassport", "en") is None, question


def test_bangla_citation_uses_bangla_labels():
    result = payment_answer.answer("পেমেন্ট চ্যানেল কোনগুলো?", "epassport", "bn")
    assert result is not None
    citation = result["citations"][0]
    assert citation["title"].startswith("ই-পাসপোর্ট")
    assert DATA["payment_channels"][0]["label_bn"] in citation["quote_snippet"]


def test_ask_payment_question_skips_retrieval(monkeypatch):
    def should_not_run(*args, **kwargs):
        raise AssertionError("payment answer must not retrieve")

    monkeypatch.setattr(retriever, "retrieve", should_not_run)
    response = client.post("/api/copilot/ask", json={
        "question": "Pay fee with ShurjoPay?",
        "service_id": "epassport",
        "language": "en",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["generation_mode"] == "deterministic"
    assert body["grounded"] is True
    assert "ShurjoPay" in body["answer"]
