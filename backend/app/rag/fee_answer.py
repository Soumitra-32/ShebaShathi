"""Deterministic answers for verified fee questions.

The copilot must never let a language model choose between a regular, express
and super-express fee tier: those strings are nearly identical in embedding
space and a wrong tier is a wrong amount. When the question names the published
parameters, this module calculates the answer from
``data/fee_schedules.json`` and returns a citation. Otherwise it either returns
``None`` (so normal retrieval can handle a non-amount question) or a
parameter-request clarification.
"""
from __future__ import annotations

import re
from typing import Any

from ..engine import fee_schedules

_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

_AMOUNT_WORDS = (
    "fee", "fees", "cost", "price", "taka", "tk", "how much",
    "ফি", "টাকা", "মূল্য", "কত",
)
_NON_AMOUNT_PHRASES = (
    "payment channel", "pay the fee", "how to pay", "how do i pay", "how can i pay",
    "delivery time", "processing time", "verify", "check the fee", "check fee",
    "payment", "challan", "shurjopay",
    "পেমেন্ট", "পরিশোধ", "চ্যানেল", "সময়", "যাচাই", "চালান",
)


def _normalise(text: str) -> str:
    return text.translate(_DIGITS).casefold()


def _is_amount_question(question: str) -> bool:
    value = question.casefold()
    if not any(word in value for word in _AMOUNT_WORDS):
        return False
    return not any(phrase in value for phrase in _NON_AMOUNT_PHRASES)


def _detect_service(question: str) -> str | None:
    value = question.casefold()
    if any(term in value for term in ("passport", "পাসপোর্ট", "epassport")):
        return "epassport"
    if any(term in value for term in ("driving", "licence", "license", "ড্রাইভিং", "লাইসেন্স", "brta")):
        return "driving_licence"
    return None


def _bn(value: int | str, language: str) -> str:
    text = str(value)
    return text.translate(_BN_DIGITS) if language == "bn" else text


def _citation(result: dict[str, Any], quote: str) -> dict[str, str]:
    return {
        "title": f"{result['service_label_en']} — verified fee schedule",
        "url": result["source_url"],
        "last_verified": result["last_verified"],
        "quote_snippet": quote[:300],
    }


def _clarification(service_id: str, missing: list[str], language: str) -> dict[str, Any]:
    service = fee_schedules.SERVICES[service_id]
    is_bn = language == "bn"
    if service_id == "epassport":
        needed = "পৃষ্ঠা (৪৮/৬৪), মেয়াদ (৫/১০ বছর) এবং ডেলিভারি (সাধারণ/এক্সপ্রেস/সুপার এক্সপ্রেস)"
        needed_en = "pages (48/64), validity (5/10 years) and delivery (regular/express/super express)"
    else:
        needed = "সেবার ধরন (লার্নার/স্মার্ট কার্ড/নবায়ন/ডুপ্লিকেট) এবং প্রযোজ্য হলে পেশাদার/অপেশাদার"
        needed_en = "service type (learner/smart card/renewal/duplicate) and professional/non-professional where applicable"
    answer = (
        f"সঠিক ফি বলতে {needed} জানতে হবে। প্রকাশিত ফি তালিকা: {service['source_url']} "
        f"(যাচাই: {service['last_verified']})।"
        if is_bn else
        f"To state the exact fee I need {needed_en}. Published fee schedule: {service['source_url']} "
        f"(verified {service['last_verified']})."
    )
    return {
        "answer": answer,
        "citations": [_citation({
            "service_label_en": service["label_en"],
            "source_url": service["source_url"],
            "last_verified": service["last_verified"],
        }, f"Missing parameters: {', '.join(missing)}. The official schedule lists the selectable values.")],
        "grounded": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def _epassport_selection(question: str) -> tuple[dict[str, str], list[str]]:
    value = _normalise(question)
    selection: dict[str, str] = {}
    missing: list[str] = []

    pages = re.search(r"\b(48|64)\b", value)
    if pages:
        selection["pages"] = pages.group(1)
    else:
        missing.append("pages")

    validity = re.search(r"\b(5|10)\s*[- ]?\s*(?:years?|yrs?|year-old|বছর|বৎসর)", value)
    if validity:
        selection["validity_years"] = validity.group(1)
    else:
        missing.append("validity_years")

    if any(term in value for term in ("super express", "super-express", "সুপার এক্সপ্রেস")):
        selection["delivery"] = "super_express"
    elif any(term in value for term in ("express", "এক্সপ্রেস")):
        selection["delivery"] = "express"
    elif any(term in value for term in ("regular", "normal", "standard", "সাধারণ")):
        selection["delivery"] = "regular"
    else:
        missing.append("delivery")
    return selection, missing


def _driving_selection(question: str) -> tuple[dict[str, str], list[str]]:
    value = _normalise(question)
    selection: dict[str, str] = {}
    missing: list[str] = []

    if any(term in value for term in ("duplicate", "ডুপ্লিকেট", "হারানো")):
        selection["service_type"] = "duplicate"
    elif any(term in value for term in ("renew", "renewal", "নবায়ন")):
        selection["service_type"] = "renewal"
    elif any(term in value for term in ("learner", "লার্নার", "শিক্ষানবিশ")):
        selection["service_type"] = "learner"
    elif any(term in value for term in ("smart card", "smart-card", "স্মার্ট কার্ড")):
        selection["service_type"] = "smart_card"
    else:
        missing.append("service_type")

    if selection.get("service_type") == "learner":
        category = re.search(r"(?:category|ক্যাটাগরি)\s*([12])", value)
        if category:
            selection["learner_category"] = category.group(1)
        else:
            missing.append("learner_category")
    elif selection.get("service_type") in ("smart_card", "renewal"):
        if any(term in value for term in ("non-professional", "non professional", "অপেশাদার")):
            selection["professional"] = "no"
        elif any(term in value for term in ("professional", "পেশাদার")):
            selection["professional"] = "yes"
        else:
            missing.append("professional")

    late = re.search(r"(\d+)\s*(?:years?|বছর)\s*(?:late|দেরি)", value)
    if late:
        selection["years_late"] = late.group(1)
    return selection, missing


def _delivery_label(value: str, language: str) -> str:
    labels = {
        "regular": ("সাধারণ", "regular"),
        "express": ("এক্সপ্রেস", "express"),
        "super_express": ("সুপার এক্সপ্রেস", "super express"),
    }
    return labels[value][0 if language == "bn" else 1]


def _format(service_id: str, selection: dict[str, str], result: dict[str, Any], language: str) -> dict[str, Any]:
    is_bn = language == "bn"
    if service_id == "epassport":
        description = (
            f"{_bn(selection['pages'], language)} পৃষ্ঠা, {_bn(selection['validity_years'], language)} বছর মেয়াদ, "
            f"{_delivery_label(selection['delivery'], language)} ডেলিভারি"
            if is_bn else
            f"{selection['pages']}-page, {selection['validity_years']}-year, "
            f"{_delivery_label(selection['delivery'], language)} delivery"
        )
    else:
        type_labels = {
            "learner": ("লার্নার", "learner"),
            "smart_card": ("স্মার্ট কার্ড", "smart card"),
            "renewal": ("নবায়ন", "renewal"),
            "duplicate": ("ডুপ্লিকেট", "duplicate"),
        }
        service_type = selection["service_type"]
        type_label = type_labels[service_type][0 if is_bn else 1]
        description = type_label
        if selection.get("professional"):
            if is_bn:
                description += " (" + ("পেশাদার" if selection["professional"] == "yes" else "অপেশাদার") + ")"
            else:
                description += " (" + ("professional" if selection["professional"] == "yes" else "non-professional") + ")"
        if selection.get("learner_category"):
            description += f" (category {_bn(selection['learner_category'], language)})"

    components = "; ".join(
        f"{part['label_bn']} {_bn(part['amount'], language)} টাকা"
        if is_bn else
        f"{part['label_en']} {part['amount']} BDT"
        for part in result["components"]
    )
    scope = result.get("scope_note_bn" if is_bn else "scope_note_en", "")
    answer = (
        f"{description}-এর প্রকাশিত মোট ফি {_bn(result['total'], language)} টাকা। "
        f"{components}। {scope} সূত্র: {result['source_url']} (যাচাই: {result['last_verified']})।"
        if is_bn else
        f"The published total for {description} is {result['total']} BDT. "
        f"{components}. {scope} Source: {result['source_url']} (verified {result['last_verified']})."
    )
    quote = (
        f"Rule {result['rule_id']}: total {result['total']} BDT. "
        f"Components: " + "; ".join(f"{part['label_en']} {part['amount']} BDT" for part in result["components"])
    )
    return {
        "answer": answer,
        "citations": [_citation(result, quote)],
        "grounded": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def _is_verification_question(question: str) -> bool:
    value = question.casefold()
    if not any(term in value for term in ("verify", "check", "confirm", "যাচাই", "পরীক্ষা")):
        return False
    return any(
        term in value
        for term in ("fee", "fees", "licence", "license", "passport", "ফি", "টাকা", "লাইসেন্স", "পাসপোর্ট")
    )


def _verification(service_id: str, language: str) -> dict[str, Any]:
    service = fee_schedules.SERVICES[service_id]
    is_bn = language == "bn"
    scope = service.get("scope_note_bn" if is_bn else "scope_note_en", "")
    citation = _citation(
        {
            "service_label_en": service["label_en"],
            "source_url": service["source_url"],
            "last_verified": service["last_verified"],
        },
        f"Verify the current fee at {service['source_url']}. Last verified {service['last_verified']}. {scope}",
    )
    answer = (
        f"বর্তমান ফি অফিসিয়াল পেজে যাচাই করুন: {service['source_url']} "
        f"(যাচাই: {service['last_verified']})। {scope}"
        if is_bn else
        f"Verify the current fee on the official page: {service['source_url']} "
        f"(verified {service['last_verified']}). {scope}"
    )
    return {
        "answer": answer,
        "citations": [citation],
        "grounded": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def answer(question: str, service_id: str | None = None, language: str = "bn") -> dict[str, Any] | None:
    """Return a deterministic fee answer, clarification, or ``None``.

    ``None`` means the question is not an amount question or has no verified
    schedule; the caller should continue with normal retrieval.
    """
    service_id = service_id or _detect_service(question)
    if _is_verification_question(question):
        if service_id in ("epassport", "driving_licence"):
            return _verification(service_id, language)
        return None
    if not _is_amount_question(question):
        return None
    if service_id == "epassport":
        selection, missing = _epassport_selection(question)
    elif service_id == "driving_licence":
        selection, missing = _driving_selection(question)
    else:
        return None

    if missing:
        return _clarification(service_id, missing, language)
    try:
        result = fee_schedules.calculate(service_id, selection)
    except ValueError:
        return None
    return _format(service_id, selection, result, language)
