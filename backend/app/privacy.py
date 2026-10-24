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
