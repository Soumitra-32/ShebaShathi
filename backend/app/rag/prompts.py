import re

FALLBACK_BN = "সরকারি তথ্যে এটি নির্দিষ্ট করা যায়নি। অনুগ্রহ করে সংশ্লিষ্ট সরকারি পোর্টালে যাচাই করুন।"
FALLBACK_EN = "The available official sources do not specify this. Please check the relevant official portal."


def plain_text(text: str) -> str:
    """Strip light Markdown so chat/brief answers read cleanly as plain text.

    The model is instructed not to emit Markdown, but providers occasionally
    still add ``**bold**``, backticks or ``#`` headings. The UI renders answers
    with ``whitespace-pre-wrap`` and no Markdown parser, so literal markers would
    otherwise leak into the answer. Only formatting characters are removed; the
    factual text and numbers are untouched.
    """
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\*\s+", "• ", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()

SYSTEM_PROMPT = """You are ShebaShathi, an independent assistant that explains Bangladesh citizen identity and public-service procedures.
Rules:
1. Answer ONLY from the provided CONTEXT for the selected service. Do not use outside knowledge or rules from another service.
2. If the CONTEXT does not explicitly state the answer, return an empty answer and no used_chunk_ids. A short topic phrase (for example "Bank A-Challan" or "adult photo") is a request for the relevant verified fact in the CONTEXT; answer it when that fact is present.
3. Never invent fees, dates, document names, phone numbers, URLs, laws, or requirements.
4. The request line "Question (en)" means answer in English and "Question (bn)" means answer in Bangla. Do not switch language.
5. Return valid JSON only: {"answer": string, "used_chunk_ids": [string]}.
6. Never advise paying any unofficial fee or using an intermediary.
7. Never claim to authenticate a person or document, make a final legal or eligibility decision, submit an application, or access an official account.
8. Never ask the user to provide identity numbers, OTPs, account credentials, or document images, and never repeat such values back if the user includes them.
9. Every numeric claim in the answer must appear in a cited context excerpt.
10. Do not refuse only because the user wrote a short noun phrase instead of a full question.
11. Do not write URLs in the answer; the app shows the cited official links separately.
12. Use plain text only: no Markdown symbols such as **, #, backticks or * bullets."""
