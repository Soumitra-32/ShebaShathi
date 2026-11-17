"""Choose a cited excerpt only when it actually supports the question.

Without a provider, the copilot falls back to a retrieved source chunk. The
retriever ranks by cosine similarity, and an in-scope question can still score
highest on a chunk that shares only a service word ("passport") while answering
a different task. This module adds a deterministic support check:

* prefer a chunk from the section the question asks about (documents, fees,
  process, payment, warnings);
* accept the chunk when it shares a non-service task word with the question;
* otherwise accept only a very high retrieval score, which covers a paraphrase
  with no shared vocabulary;
* return ``None`` when neither condition holds, so the caller shows the safe
  fallback instead of an unrelated excerpt.
"""
from __future__ import annotations

import re

from ..config import settings
from .relevance import is_service_term

_TOKEN_RE = re.compile(r"[a-z0-9\u0980-\u09FF]+", re.IGNORECASE)

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can",
    "could", "did", "do", "does", "for", "from", "has", "have", "how", "i",
    "if", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our",
    "please", "should", "so", "that", "the", "their", "them", "there", "this",
    "to", "was", "we", "were", "what", "when", "where", "which", "who", "why",
    "will", "with", "would", "you", "your",
    "আমি", "আমার", "আমরা", "একটি", "এর", "এই", "ও", "এবং", "কি", "কী",
    "কীভাবে", "কিভাবে", "কোথায়", "কখন", "কেন", "কত", "জন্য", "করে", "করব",
    "হয়", "হবে", "আছে", "নেই", "একটা", "আমাকে", "আমারটা",
}

_SECTION_HINTS = {
    "documents": ("document", "documents", "paper", "papers", "paperwork",
                  "requirement", "requirements", "কাগজ", "কাগজপত্র", "নথি"),
    "fees": ("fee", "fees", "cost", "price", "taka", "tk", "bdt", "delivery",
             "processing time", "ফি", "টাকা", "মূল্য", "ডেলিভারি", "কত দিন", "কত সময়"),
    "payment": ("payment", "pay", "challan", "shurjopay", "পেমেন্ট", "পরিশোধ", "চালান"),
    "process": ("step", "steps", "process", "procedure", "how", "renew", "renewal",
                "reissue", "ধাপ", "পদ্ধতি", "প্রক্রিয়া", "নবায়ন",
                "কীভাবে", "কিভাবে", "আবেদন"),
    "warnings": ("warning", "warnings", "caution", "fraud", "agent", "broker",
                 "সতর্কতা", "প্রতারণা", "দালাল"),
}


def _tokens(text: str) -> set[str]:
    return {
        token.casefold()
        for token in _TOKEN_RE.findall(text or "")
        if len(token) > 1
    }


def _task_tokens(question: str) -> set[str]:
    return {
        token
        for token in _tokens(question)
        if token not in _STOPWORDS and not is_service_term(token)
    }


def _expected_section(question: str) -> str | None:
    value = (question or "").casefold()
    for section, terms in _SECTION_HINTS.items():
        if any(term in value for term in terms):
            return section
    return None


def supported_excerpt(question: str, docs: list[dict]) -> dict | None:
    """Return the best supported chunk, or ``None`` when none answers.

    The retrieved chunk text is never rewritten: a supported excerpt is shown
    unchanged with its citation. Only the *choice* of whether to show it is
    deterministic.
    """
    if not docs:
        return None
    expected = _expected_section(question)
    candidates = docs
    if expected:
        matching = [
            doc for doc in docs
            if (doc.get("metadata", {}).get("section") or "") == expected
        ]
        if matching:
            candidates = matching

    task_words = _task_tokens(question)
    for doc in candidates:
        overlap = task_words & _tokens(doc.get("text", ""))
        if overlap:
            return doc
        # A high-scoring paraphrase may share no words with the Bangla/English
        # source. Keep this threshold deliberately strict: a wrong excerpt is
        # worse than asking the user to check the official source.
        if float(doc.get("score", 0.0)) >= settings.extractive_min_score:
            return doc
    return None
