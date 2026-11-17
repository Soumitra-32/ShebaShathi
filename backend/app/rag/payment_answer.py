"""Deterministic answers for published e-Passport payment channels.

The channel list is a short, stable fact in ``data/requirements.json``. It is
not a fee amount and it must never be selected by a language model: an English
question can otherwise miss the Bangla-only channel paragraph in the corpus and
fall back even though the verified list exists.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..intake.engine import detect_service
from ..services import loader

REQUIREMENTS_FILE = Path(__file__).resolve().parents[3] / "data" / "requirements.json"

_PAYMENT_TERMS = (
    "payment channel", "payment channels", "payment method", "payment methods",
    "payment option", "payment options", "payment gateway", "payment slip",
    "pay online", "online payment", "pay by card", "pay by bank", "card payment",
    "bank payment", "mobile banking", "bank counter", "bank branch", "pay at",
    "pay through", "accept card", "accepts card", "which bank", "which counter",
    "how to pay", "how do i pay", "how can i pay", "where can i pay",
    "where do i pay", "where to pay", "pay the fee", "pay fee", "fee payment",
    "challan", "shurjopay", "dgepay",
    "পেমেন্ট চ্যানেল", "পেমেন্ট", "অনলাইন পেমেন্ট", "টাকা দেওয়ার", "ফি দেওয়ার",
    "ফি পরিশোধ", "টাকা পরিশোধ", "কার্ডে", "ব্যাংকে", "মোবাইল ব্যাংকিং", "চালান",
)

# A checklist question can mention payment without asking for a channel. Those
# questions belong to the document tool, which runs later in the pipeline.
_DOCUMENT_TERMS = (
    "document", "documents", "paper", "papers", "requirement", "requirements",
    "checklist",
    "কাগজ", "কাগজপত্র", "নথি", "প্রয়োজন", "তালিকা",
)


@lru_cache(maxsize=1)
def _data() -> dict[str, Any] | None:
    try:
        data = json.loads(REQUIREMENTS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    channels = data.get("payment_channels")
    if not isinstance(channels, list) or not channels:
        return None
    for channel in channels:
        if not isinstance(channel, dict):
            return None
        if not channel.get("label_bn") or not channel.get("label_en"):
            return None
        url = str(channel.get("source_url", ""))
        if not url.startswith("https://") or not channel.get("last_verified"):
            return None
    return data


def _is_payment_question(question: str) -> bool:
    value = (question or "").casefold()
    if any(term in value for term in _DOCUMENT_TERMS):
        return False
    return any(term in value for term in _PAYMENT_TERMS)


def _citation(service_name_bn: str, service_name_en: str, data: dict[str, Any],
              language: str) -> dict[str, str]:
    channel = data["payment_channels"][0]
    is_bn = language == "bn"
    labels = "; ".join(
        item["label_bn" if is_bn else "label_en"] for item in data["payment_channels"]
    )
    return {
        "title": (
            f"{service_name_bn} — পেমেন্ট চ্যানেল" if is_bn
            else f"{service_name_en} — payment channels"
        ),
        "url": channel["source_url"],
        "last_verified": channel["last_verified"],
        "quote_snippet": (
            f"প্রকাশিত পেমেন্ট চ্যানেল: {labels}।" if is_bn
            else f"Published payment channels: {labels}."
        ),
    }


def _format(service_name_bn: str, service_name_en: str, data: dict[str, Any],
            language: str) -> dict[str, Any]:
    is_bn = language == "bn"
    channels = data["payment_channels"]
    labels = "; ".join(
        item["label_bn" if is_bn else "label_en"] for item in channels
    )
    source_url = channels[0]["source_url"]
    verified = channels[0]["last_verified"]
    if is_bn:
        answer = (
            f"{service_name_bn}-এর জন্য প্রকাশিত পেমেন্ট চ্যানেল: {labels}। "
            f"উৎস: {source_url} (যাচাই: {verified})।"
        )
    else:
        answer = (
            f"Published payment channels for {service_name_en}: {labels}. "
            f"Source: {source_url} (verified {verified})."
        )
    return {
        "answer": answer,
        "citations": [_citation(service_name_bn, service_name_en, data, language)],
        "grounded": True,
        "answer_found": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def answer(question: str, service_id: str | None = None, language: str = "bn") -> dict[str, Any] | None:
    """Return the published payment-channel list for e-Passport, or ``None``."""
    if not _is_payment_question(question):
        return None
    resolved = service_id or detect_service(question)
    if resolved != "epassport":
        return None
    data = _data()
    if data is None:
        return None
    try:
        service = loader.get_service("epassport")
    except (KeyError, RuntimeError):
        return None
    return _format(
        service["service_name_bn"],
        service["service_name_en"],
        data,
        "en" if language == "en" else "bn",
    )
