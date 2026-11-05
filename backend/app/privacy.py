"""Privacy guards for free-text endpoints.

The copilot and the AI intake accept short natural-language descriptions. A
user may accidentally paste an NID, passport number, phone number or other
long identifier. Those values must never reach a model provider, a log line or
a stored index, so the endpoints reject the request before doing any work.

This is deliberately conservative: a false positive only asks the user to
rephrase, while a false negative could leak an identity number to a third
party.
"""
from __future__ import annotations

import re

_BN_DIGITS = "০১২৩৪৫৬৭৮৯"
_DIGIT_CLASS = f"0-9{_BN_DIGITS}"

# 10+ digits, optionally separated by spaces or hyphens (NID, phone, account).
_LONG_NUMBER_RE = re.compile(
    rf"(?<![{_DIGIT_CLASS}])(?:[{_DIGIT_CLASS}][\s-]?){{10,}}(?![{_DIGIT_CLASS}])"
)

# Machine-readable passport zone: at least 28 characters with a filler '<'.
_MRZ_RE = re.compile(r"(?<![A-Z0-9<])(?=[A-Z0-9<]*<)[A-Z0-9<]{28,44}(?![A-Z0-9<])")

# A sensitive keyword followed by a shorter number that still looks like an
# identifier (e.g. "NID 123456789", "OTP 123456").
_CONTEXT_RE = re.compile(
    r"(?:nid|national\s+id|passport|brn|licen[cs]e|mobile|phone|otp|pin|"
    r"এনআইডি|জাতীয়\s+পরিচয়|পাসপোর্ট|জন্ম\s+নিবন্ধন\s+নম্বর|মোবাইল|ওটিপি|পিন)"
    rf"[^0-9{_BN_DIGITS}]{{0,12}}(?:[{_DIGIT_CLASS}][\s-]?){{6,}}",
    re.IGNORECASE,
)


def contains_identity_number(text: str) -> bool:
    """Return True when the text appears to contain an identity-like number.

    Short values such as an age (``5``) or a passport page count (``48``) are
    allowed. The function only checks shape, never extracts or returns the
    matched value.
    """
    if not text:
        return False
    return bool(
        _LONG_NUMBER_RE.search(text)
        or _MRZ_RE.search(text)
        or _CONTEXT_RE.search(text)
    )


# Secret words that should never travel to a third-party model provider, even
# without a number next to them (credentials, codes, card data).
_SECRET_TERMS = (
    "password", "pass word", "passcode", "pass phrase", "passphrase",
    "one time code", "one-time code", "onetime code", "verification code",
    "login code", "security code", "cvv", "cvc", "card number", "card pin",
    "net banking password", "netbanking password",
    "পাসওয়ার্ড", "গোপন নম্বর", "গোপন কোড", "ওটিপি", "নিরাপত্তা কোড", "পিন নম্বর",
)

_SECRET_RE = re.compile(
    "|".join(re.escape(term) for term in _SECRET_TERMS),
    re.IGNORECASE,
)


def contains_sensitive_data(text: str) -> bool:
    """Broader screen for content that must not be sent to an LLM provider.

    Everything ``contains_identity_number`` catches, plus secret-word mentions
    (passwords, OTPs, card data). Used by the chat layer: a message matching
    this is answered locally instead of being forwarded to the provider.
    """
    if not text:
        return False
    return contains_identity_number(text) or bool(_SECRET_RE.search(text))


# Appended (never a standalone message) when a question was answered locally
# because screening matched. It never quotes or hints at the matched content.
SCREENED_NOTE_BN = (
    " — নিরাপত্তার স্বার্থে ব্যক্তিগত নম্বর বা কোডের সম্ভাবনা থাকা বার্তা "
    "বাইরের কোনো এআই সেবায় পাঠানো হয় না; এই উত্তর এখানেই, যাচাইকৃত উৎস "
    "থেকে তৈরি হয়েছে। সংক্ষিপ্ত প্রশ্ন লিখলে আরও ভালো উত্তর পাবেন।"
)
SCREENED_NOTE_EN = (
    " — For safety, messages that appear to contain personal numbers or "
    "secret codes are never sent to the external AI service; this answer "
    "was generated locally from verified sources. A short question will get a better answer."
)


def screened_note(language: str) -> str:
    """Privacy note for locally answered (screened) questions."""
    return SCREENED_NOTE_EN if language == "en" else SCREENED_NOTE_BN
