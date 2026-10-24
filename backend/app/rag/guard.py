"""Deterministic safety guard for free-text questions and intake.

The guard runs before retrieval or generation. It blocks requests that ask
for an intermediary, a bribe, an off-the-books cash payment, a biometric
bypass or a forged document. Blocking is deterministic so it cannot be
talked out of by prompt injection in the user text or the retrieved corpus.
"""
from __future__ import annotations

import re

_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "intermediary": (
        re.compile(r"\b(?:agent|agents|broker|middleman|middle-men|tout|touts|dalal)\b", re.IGNORECASE),
        re.compile(r"দালাল|এজেন্ট|মধ্যস্থতাকারী|লবিস্ট|তদবির"),
    ),
    "bribe": (
        re.compile(r"\b(?:bribe|bribery|baksheesh|kickback)\b", re.IGNORECASE),
        re.compile(r"ঘুষ|ঘুস|উৎকোচ"),
    ),
    "cash_bypass": (
        re.compile(r"\bcash\s+(?:at|in|to)\s+(?:the\s+)?(?:passport\s+|service\s+)?counter\b", re.IGNORECASE),
        re.compile(r"\b(?:passport|service)\s+counter\b.*\bcash\b", re.IGNORECASE),
        re.compile(r"\bcash\b.*\b(?:skip|without|avoid|no\s+receipt|under\s+the\s+table)\b", re.IGNORECASE),
        re.compile(r"কাউন্টারে\s+(?:নগদ\s+)?টাকা|টাকা\s+দিয়ে\s+.*(?:স্কিপ|ছাড়া|লাইন)"),
    ),
    "biometric_bypass": (
        re.compile(r"\bbiometric\b.*\b(?:without|skip|avoid|no)\b", re.IGNORECASE),
        re.compile(r"\b(?:without|skip|avoid|no)\b.*\bbiometric\b", re.IGNORECASE),
        re.compile(r"\b(?:fingerprint|fingerprints)\b.*\b(?:without|skip|avoid)\b", re.IGNORECASE),
        re.compile(r"বায়োমেট্রিক.*(?:ছাড়া|স্কিপ)|(?:ছাড়া|স্কিপ).*বায়োমেট্রিক|আঙুলের\s+ছাপ.*ছাড়া"),
    ),
    "fake_document": (
        re.compile(r"\b(?:fake|forged|fabricated)\b.*\b(?:document|documents|certificate|nid|passport)\b", re.IGNORECASE),
        re.compile(r"\b(?:document|documents|certificate|nid|passport)\b.*\b(?:fake|forged)\b", re.IGNORECASE),
        re.compile(r"(?:জাল|নকল).*(?:কাগজ|সনদ|সার্টিফিকেট|এনআইডি|পাসপোর্ট)"),
    ),
}

_MESSAGES = {
    "intermediary": {
        "en": (
            "Do not use an agent, broker or middleman for a government service. "
            "Apply only through the official portal and pay only the published fee. "
            "Anyone who promises faster service for extra money is not an official channel."
        ),
        "bn": (
            "সরকারি সেবার জন্য দালাল, এজেন্ট বা মধ্যস্থতাকারী ব্যবহার করবেন না। "
            "শুধু সরকারি পোর্টালে আবেদন করুন এবং প্রকাশিত ফি পরিশোধ করুন। "
            "অতিরিক্ত টাকার বিনিময়ে দ্রুত সেবার প্রতিশ্রুতি সরকারি চ্যানেল নয়।"
        ),
    },
    "bribe": {
        "en": (
            "Never pay a bribe. Pay only the published fee through the official channel "
            "and keep the receipt. You can report a demand for extra money through the "
            "official grievance portal."
        ),
        "bn": (
            "কখনো ঘুষ দেবেন না। শুধু সরকারি চ্যানেলে প্রকাশিত ফি পরিশোধ করুন এবং "
            "রসিদ সংরক্ষণ করুন। অতিরিক্ত টাকা দাবি করলে সরকারি অভিযোগ পোর্টালে জানান।"
        ),
    },
    "cash_bypass": {
        "en": (
            "Pay only through the official payment channel and keep the receipt. "
            "Cash paid outside the published process cannot be verified, and it does "
            "not make the application faster or guarantee a result."
        ),
        "bn": (
            "শুধু সরকারি পেমেন্ট চ্যানেলে ফি পরিশোধ করুন এবং রসিদ সংরক্ষণ করুন। "
            "প্রকাশিত প্রক্রিয়ার বাইরে নগদ টাকা দিলে তা যাচাই করা যায় না এবং "
            "আবেদন দ্রুত হয় বা ফলাফল নিশ্চিত হয় না।"
        ),
    },
    "biometric_bypass": {
        "en": (
            "Biometric enrolment (photo, fingerprints and signature) is part of the "
            "official application and cannot be skipped. Follow the enrolment "
            "instructions on the official portal."
        ),
        "bn": (
            "বায়োমেট্রিক এনরোলমেন্ট (ছবি, আঙুলের ছাপ ও স্বাক্ষর) সরকারি আবেদনের "
            "অংশ এবং এটি এড়িয়ে যাওয়া যায় না। সরকারি পোর্টালের এনরোলমেন্ট "
            "নির্দেশনা অনুসরণ করুন।"
        ),
    },
    "fake_document": {
        "en": (
            "Never submit a fake or altered document. Use the genuine document listed "
            "in the official requirements; a mismatch can invalidate the application "
            "and create legal risk."
        ),
        "bn": (
            "কখনো জাল বা পরিবর্তিত কাগজ জমা দেবেন না। সরকারি তালিকায় থাকা আসল "
            "কাগজপত্র ব্যবহার করুন; তথ্য না মিললে আবেদন বাতিল হতে পারে এবং আইনি "
            "ঝুঁকি তৈরি হতে পারে।"
        ),
    },
}


def classify(text: str) -> str | None:
    """Return an unsafe-intent category, or ``None`` for normal questions."""
    if not text:
        return None
    for category, patterns in _PATTERNS.items():
        if any(pattern.search(text) for pattern in patterns):
            return category
    return None


def safety_message(category: str, language: str = "bn") -> str:
    messages = _MESSAGES.get(category)
    if not messages:
        return _MESSAGES["intermediary"][language if language == "en" else "bn"]
    return messages["en" if language == "en" else "bn"]
