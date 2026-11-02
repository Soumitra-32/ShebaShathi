"""Deterministic answers for verified application-status questions.

Status strings such as ``Pending for SB Police Clearance`` are official
processing jargon. A language model has no way to know what they mean in the
Bangladesh system, so when the question clearly asks about one, this module
answers from the validated guidance data (``data/guidance/epassport.json``)
with a citation. Anything else returns ``None`` so normal retrieval continues.
"""
from __future__ import annotations

from ..guidance import get_guide

_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

_STATUS_TERMS: dict[str, tuple[str, ...]] = {
    "pending_sb_police_clearance": (
        "pending for sb police clearance", "pending sb police clearance",
        "sb police clearance", "sb clearance", "police verification status",
        "এসবি ক্লিয়ারেন্স", "এসবি পুলিশ ক্লিয়ারেন্স", "এসবি পুলিশ ভেরিফিকেশন",
    ),
    "enrolment_in_process": (
        "enrolment in process", "enrollment in process",
    ),
    "backend_verification": (
        "backend verification", "ব্যাকএন্ড ভেরিফিকেশন",
    ),
    "pending_final_approval": (
        "pending for final approval", "final approval",
    ),
    "pending_print_queue": (
        "pending in print queue", "print queue",
    ),
    "sent_for_rework": (
        "sent for rework", "rework",
    ),
}

_GENERIC_STATUS_TERMS = (
    "application status", "passport status", "check status", "status check",
    "my status", "স্ট্যাটাস", "স্টেটাস", "অবস্থা",
)

_HOTLINE_TERMS = (
    "16445", "09666716445", "96 66 71 64", "helpline", "help line", "call center",
    "call centre", "হেল্পলাইন", "হটলাইন", "কল সেন্টার", "কল সেন্টার",
)

_PASSPORT_TERMS = ("passport", "epassport", "পাসপোর্ট")


def _normalise(text: str) -> str:
    return text.translate(_DIGITS).casefold()


def _detect_service(question: str, service_id: str | None) -> str | None:
    if service_id is not None:
        return service_id
    value = question.casefold()
    if any(term in value for term in _PASSPORT_TERMS):
        return "epassport"
    return None


def _match_status(normalised: str) -> str | None:
    for status_id, terms in _STATUS_TERMS.items():
        if any(term in normalised for term in terms):
            return status_id
    return None


def _find_filled(general: dict, status_id: str) -> dict | None:
    """Locate a status by id inside the validated, decoded content data."""
    for status in general:
        if status["id"] == status_id:
            return status
    return None


def _citation(source_url: str, last_verified: str, title: str, quote: str) -> dict[str, str]:
    return {
        "title": title,
        "url": source_url,
        "last_verified": last_verified,
        "quote_snippet": quote[:300],
    }


def answer(question: str, service_id: str | None, language: str) -> dict | None:
    """Return a grounded, deterministic status answer or ``None``.

    The answer text and its citation come only from the validated guidance
    data. Unsupported questions get ``None`` so retrieval can answer normally.
    """
    detected = _detect_service(question.casefold(), service_id)
    if detected != "epassport":
        return None
    try:
        guide = get_guide("epassport")
    except KeyError:
        return None

    normalised = _normalise(question)
    is_bn = language == "bn"
    title = guide["title_bn" if is_bn else "title_en"]

    status_id = _match_status(normalised)
    if status_id:
        status = _find_filled(guide["statuses"], status_id)
        if status is None:
            return None
        if is_bn:
            body = f"{status['meaning_bn']} {status['action_bn']}"
            quote = status["meaning_bn"]
        else:
            body = f"{status['meaning_en']} {status['action_en']}"
            quote = status["meaning_en"]
        return {
            "answer": body,
            "citations": [_citation(status["source_url"], status["last_verified"], title, quote)],
            "grounded": True,
            "generation_mode": "deterministic",
            "llm_provider": "none",
            "llm_model": None,
            "retrieved_chunks": [],
        }

    if any(term in normalised for term in _HOTLINE_TERMS):
        tip = next((item for item in guide["tips"] if item["id"] == "passport_hotline"), None)
        if tip is None:
            return None
        text = tip["text_bn"] if is_bn else tip["text_en"]
        return {
            "answer": text,
            "citations": [_citation(tip["source_url"], tip["last_verified"], title, text)],
            "grounded": True,
            "generation_mode": "deterministic",
            "llm_provider": "none",
            "llm_model": None,
            "retrieved_chunks": [],
        }

    if any(term in normalised for term in _GENERIC_STATUS_TERMS):
        how = guide["how_to_check"]
        text = how["text_bn"] if is_bn else how["text_en"]
        return {
            "answer": text,
            "citations": [ _citation(guide["source_url"], guide["last_verified"], title, text)],
            "grounded": True,
            "generation_mode": "deterministic",
            "llm_provider": "none",
            "llm_model": None,
            "retrieved_chunks": [],
        }

    return None
