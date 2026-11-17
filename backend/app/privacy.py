"""Privacy guards for free-text endpoints.

The copilot and the AI intake accept short natural-language descriptions. A
user may accidentally paste an NID, passport number, phone number, email,
OTP, password or other identifier. Those values must never reach a model
provider, a log line or a stored index, so the endpoints reject the request
before doing any work.

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

# A bare Bangladesh-style passport/licence number: one or two letters followed
# by seven to nine digits, optionally separated (for example A01234567 or
# A 01234567). Other authorities also use short alphanumeric document numbers;
# treating them as sensitive is safer than forwarding them to a model provider.
_PASSPORT_NUMBER_RE = re.compile(
    r"(?<![A-Za-z0-9])[A-Za-z]{1,2}[\s-]?[0-9]{7,9}(?![A-Za-z0-9])"
)

# A document label followed by an alphanumeric value. This catches formats
# that do not have a fixed letter/digit shape (for example "licence no:
# DK-1234567") without flagging a fee or a page count.
_DOC_NUMBER_CONTEXT_RE = re.compile(
    r"(?:passport|licen[cs]e|driving\s+licen[cs]e|nid|national\s+id|brn|"
    r"birth\s+registration|document|card)"
    r"[^A-Za-z0-9\n]{0,20}(?:number|no\.?|#|নম্বর)?"
    r"[^A-Za-z0-9\n]{0,12}[A-Za-z]{0,2}[- ]?[0-9][A-Za-z0-9-]{5,}",
    re.IGNORECASE,
)

# A data URL or a long base64 payload can contain a document image, MRZ or
# OCR output. Those must stay in the browser and never be sent to a provider.
_DATA_URL_RE = re.compile(
    r"data:(?:image|application)/(?:png|jpe?g|pdf|octet-stream);base64,"
    r"[A-Za-z0-9+/=\s]{32,}",
    re.IGNORECASE,
)

# A labelled personal name. These patterns require a value after the label and
# reject common non-name continuations, so "name correction" or "my name is
# wrong" are not treated as a disclosed name.
_NAME_STRONG_RE = re.compile(
    r"(?:\bmy\s+(?:full\s+)?name\s*(?:is|:)\s*"
    r"|\b(?:father|mother|parent|guardian|spouse)'?s\s+name\s*(?:is|:)\s*"
    r"|আমার\s+(?:পূর্ণ\s+)?নাম\s*[:：-]?\s*"
    r"|(?:পিতা|মাতা|অভিভাবক|স্বামী|স্ত্রী)র?\s+নাম\s*[:：-]?\s*)"
    r"([A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF.'-]*"
    r"(?:\s+[A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF.'-]*){0,4})",
    re.IGNORECASE,
)
_NAME_LABEL_RE = re.compile(
    r"(?:\bfull\s+name|\bname|পূর্ণ\s+নাম|নাম)\s*[:：-]\s*"
    r"([A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF.'-]*"
    r"(?:\s+[A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF.'-]*){0,4})",
    re.IGNORECASE,
)
_NAME_STOPWORDS = {
    "is", "are", "was", "not", "wrong", "correct", "correction", "change",
    "registration", "certificate", "passport", "nid", "card", "office",
    "application", "form", "fee", "document", "required", "problem", "and",
    "but", "please", "the", "a", "an", "my", "our", "your", "what", "how",
    "সংশোধন", "ভুল", "নিবন্ধন", "সনদ", "পাসপোর্ট", "কার্ড", "আবেদন", "ফি",
    "কাগজ", "প্রয়োজন", "সমস্যা", "কী", "কি", "কীভাবে", "কিভাবে", "আমার",
}

# A labelled postal address. The value must look like a real address (several
# words, or digits plus an address word); a bare "address: passport office" is
# not treated as disclosed personal data.
_ADDRESS_RE = re.compile(
    r"(?:\bmy\s+(?:home|permanent|present|current|postal)?\s*address\s*(?:is|:)\s*"
    r"|\baddress\s*[:：-]\s*"
    r"|আমার\s+(?:বাসার\s+|স্থায়ী\s+|বর্তমান\s+)?ঠিকানা\s*[:：-]?\s*"
    r"|ঠিকানা\s*[:：-]\s*)"
    r"([^\n]{4,160})",
    re.IGNORECASE,
)
_ADDRESS_WORDS = (
    "house", "road", "street", "lane", "village", "post", "district", "thana",
    "division", "flat", "block", "sector", "bazar", "বাসা", "রোড", "সড়ক",
    "গ্রাম", "ডাক", "জেলা", "থানা", "বিভাগ", "বাজার", "ফ্ল্যাট", "ব্লক",
)

# A labelled date of birth. The date value is required, so an instructional
# phrase such as "enter your date of birth" is not flagged.
_DOB_RE = re.compile(
    r"(?:date\s+of\s+birth|dob|born\s+on|জন্ম\s+তারিখ|জন্মতারিখ)"
    r"\s*(?:is|:|-)?\s*"
    r"(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}"
    r"|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})",
    re.IGNORECASE,
)

# A code-like six-or-more-digit value near the word "code" in either order
# (for example "654321 is the code I received" or "code: 654321").
_CODE_RE = re.compile(
    rf"(?:\bcode\b[^0-9{_BN_DIGITS}]{{0,20}}(?:[{_DIGIT_CLASS}][\s-]?){{6,}}|"
    rf"(?:[{_DIGIT_CLASS}][\s-]?){{6,}}[^0-9{_BN_DIGITS}]{{0,20}}\bcode\b|"
    r"কোড[^0-9০-৯]{0,20}(?:[0-9০-৯][\s-]?){6,})",
    re.IGNORECASE,
)

# Email addresses are personal data even when they contain no number.
_EMAIL_RE = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w.-])")

# A bare 6-9 digit value is most likely an OTP, account or document number.
# Ten or more digits are already covered by _LONG_NUMBER_RE. Screening a bare
# number can flag a legitimate long amount, but the chat path only answers
# locally; it never blocks the request.
_BARE_SHORT_NUMBER_RE = re.compile(
    rf"(?<![{_DIGIT_CLASS}])[{_DIGIT_CLASS}]{{6,9}}(?![{_DIGIT_CLASS}])"
)

# Public hotlines and source identifiers that may legitimately appear in a
# prior assistant answer. They are not secrets, so the narrow assistant-history
# screen must not turn a normal follow-up into a local-only reply. Values are
# normalised to ASCII digits before comparison; a leading country code or trunk
# zero is accepted. Keep this list limited to genuinely public service numbers.
_PUBLIC_NUMBERS = frozenset({
    "16445", "09666716445", "9666716445", "10500", "10350", "109", "999",
    "333", "106", "12000", "12075", "12141", "13800", "118395", "150361",
    "80888",
})
_BN_DIGIT_TRANSLATION = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# A bare date in a plausible birth year range. Labelled dates are already
# caught by _DOB_RE; this closes the common "born 01/01/1990" form without
# flagging an ordinary future deadline such as "31/12/2027".
_BARE_BIRTH_DATE_RE = re.compile(
    r"(?<!\d)(?:"
    r"(?:19[5-9]\d|20[0-2][0-6])[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])"
    r"|(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19[5-9]\d|20[0-2][0-6])"
    r")(?!\d)"
)

# A sensitive keyword followed by a shorter number that still looks like an
# identifier (e.g. "NID 123456789", "OTP 123456").
_CONTEXT_RE = re.compile(
    r"(?:nid|national\s+id|passport|brn|licen[cs]e|mobile|phone|otp|pin|"
    r"এনআইডি|জাতীয়\s+পরিচয়|পাসপোর্ট|জন্ম\s+নিবন্ধন\s+নম্বর|মোবাইল|ওটিপি|পিন)"
    rf"[^0-9{_BN_DIGITS}]{{0,12}}(?:[{_DIGIT_CLASS}][\s-]?){{6,}}",
    re.IGNORECASE,
)


def _looks_like_name(value: str) -> bool:
    tokens = [token.strip(".,;:()[]").casefold() for token in value.split()]
    if not tokens or len(tokens) > 5:
        return False
    if any(any(char.isdigit() for char in token) for token in tokens):
        return False
    return not any(token in _NAME_STOPWORDS for token in tokens)


def _contains_name(text: str) -> bool:
    for pattern in (_NAME_STRONG_RE, _NAME_LABEL_RE):
        for match in pattern.finditer(text):
            if _looks_like_name(match.group(1)):
                return True
    return False


def _contains_address(text: str) -> bool:
    for match in _ADDRESS_RE.finditer(text):
        value = match.group(1).strip()
        words = value.split()
        has_address_word = any(word.casefold().strip(".,;:()[]") in _ADDRESS_WORDS for word in words)
        has_digit = any(char.isdigit() for char in value)
        if len(words) >= 3 or (has_digit and has_address_word):
            return True
    return False


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
        or _PASSPORT_NUMBER_RE.search(text)
        or _CONTEXT_RE.search(text)
        or _DOC_NUMBER_CONTEXT_RE.search(text)
        or _DATA_URL_RE.search(text)
    )


# Secret words that should never travel to a third-party model provider, even
# without a number next to them (credentials, codes, card data).
_SECRET_TERMS = (
    "password", "pass word", "passcode", "pass phrase", "passphrase",
    "one time code", "one-time code", "onetime code", "verification code",
    "login code", "security code", "authentication code", "confirmation code",
    "sms code", "email code", "otp", "one-time password", "2fa", "two-factor",
    "mfa", "recovery code", "backup code", "auth code", "security question",
    "api key", "secret key", "access token", "refresh token", "session token",
    "cvv", "cvc", "card number", "card pin", "card expiry",
    "net banking password", "netbanking password",
    "পাসওয়ার্ড", "গোপন নম্বর", "গোপন কোড", "ওটিপি", "নিরাপত্তা কোড", "পিন নম্বর",
    "পাসকোড", "সিকিউরিটি কোড", "ভেরিফিকেশন কোড", "রিকভারি কোড",
)

_SECRET_RE = re.compile(
    "|".join(re.escape(term) for term in _SECRET_TERMS),
    re.IGNORECASE,
)


def _normalise_digits(value: str) -> str:
    return "".join(char for char in value.translate(_BN_DIGIT_TRANSLATION) if char.isdigit())


def _is_public_number(digits: str) -> bool:
    if not digits:
        return False
    candidates = {digits, digits.lstrip("0")}
    if digits.startswith("880"):
        candidates.add(digits[3:].lstrip("0"))
    if digits.startswith("0"):
        candidates.add(digits[1:].lstrip("0"))
    return any(candidate in _PUBLIC_NUMBERS for candidate in candidates)


def _has_unapproved_long_number(text: str) -> bool:
    """True when a 10+ digit value is not one of the published public numbers.

    Assistant turns may contain a hotline or a source identifier from a prior
    answer. They must not contain an unlabelled NID, bank account or card
    number, and those are exactly the long values that previously slipped
    through the narrower screen. The allowlist is deliberately tiny; a new
    public number must be added here after it is verified in the source data.
    """
    for match in _LONG_NUMBER_RE.finditer(text):
        if not _is_public_number(_normalise_digits(match.group(0))):
            return True
    return False


def contains_sensitive_data(text: str) -> bool:
    """Broader screen for content that must not be sent to an LLM provider.

    Everything ``contains_identity_number`` catches, plus secret-word mentions
    (passwords, OTPs, card data), code-like digit sequences, email addresses,
    labelled names, postal addresses and dates of birth. Used by the chat and
    intake layers: a message matching this is answered locally or rejected
    instead of being forwarded to the provider.
    """
    if not text:
        return False
    return bool(
        contains_identity_number(text)
        or _SECRET_RE.search(text)
        or _CODE_RE.search(text)
        or _EMAIL_RE.search(text)
        or _BARE_SHORT_NUMBER_RE.search(text)
        or _DOB_RE.search(text)
        or _BARE_BIRTH_DATE_RE.search(text)
        or _contains_name(text)
        or _contains_address(text)
    )


def contains_sensitive_assistant_text(text: str) -> bool:
    """Screen assistant-role history without flagging public source numbers.

    The browser supplies the whole history, so assistant turns are untrusted.
    They still need screening, but a legitimate prior answer can contain a
    public hotline, fee or waiting period (for example ``16445`` or ``15 days``).
    Treating every long number in that turn as a secret made the next question
    local for no privacy benefit. This narrower screen still catches secrets,
    context-labelled identifiers, passport/licence shapes, MRZ, email, data
    URLs, labelled dates of birth and explicitly personal names/addresses.
    """
    if not text:
        return False
    return bool(
        _MRZ_RE.search(text)
        or _PASSPORT_NUMBER_RE.search(text)
        or _CONTEXT_RE.search(text)
        or _DOC_NUMBER_CONTEXT_RE.search(text)
        or _DATA_URL_RE.search(text)
        or _SECRET_RE.search(text)
        or _CODE_RE.search(text)
        or _EMAIL_RE.search(text)
        or _DOB_RE.search(text)
        or _has_unapproved_long_number(text)
        or _contains_name(text)
        or _contains_address(text)
    )


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
