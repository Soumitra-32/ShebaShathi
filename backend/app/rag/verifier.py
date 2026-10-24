"""Validate model chunk references, source metadata, and numeric claims."""
import re

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def _numbers(text: str) -> set[str]:
    normalized = text.translate(_BN_DIGITS)
    # Numbered-list markers are formatting, not factual claims. Without this,
    # a correct five-item answer is rejected because "1." and "2." are not in
    # the cited source text.
    normalized = re.sub(r"(^|[;؛:\n।])\s*\d{1,3}[.)।]\s*", r"\1 ", normalized)
    tokens = re.findall(r"[0-9০-৯]+(?:[,.][0-9০-৯]+)*", normalized)
    return {re.sub(r"[,.]", "", token) for token in tokens}


def verify(answer_data: dict, question: str | None = None) -> dict:
    chunks = answer_data.get("retrieved_chunks", [])
    by_id = {chunk.get("id"): chunk for chunk in chunks if chunk.get("id")}
    used = answer_data.get("used_chunk_ids", [])
    answer = answer_data.get("answer", "")
    issues = []
    if not answer.strip():
        issues.append("empty answer")
    if not used:
        issues.append("no cited chunk ids")
    if any(chunk_id not in by_id for chunk_id in used):
        issues.append("unknown chunk id")
    cited = [by_id[chunk_id] for chunk_id in used if chunk_id in by_id]
    if any(not (chunk.get("metadata", {}).get("source_url", "").startswith("https://") and
                    chunk.get("metadata", {}).get("last_verified")) for chunk in cited):
        issues.append("missing verified source metadata")
    context = "\n".join(chunk.get("text", "") for chunk in cited)
    unsupported = _numbers(answer) - _numbers(context)
    if unsupported:
        issues.append("unsupported numeric claims")
    context_urls = set(re.findall(r"https?://[^\s)\]}>,]+", context))
    answer_urls = set(re.findall(r"https?://[^\s)\]}>,]+", answer))
    if any(url not in context_urls for url in answer_urls):
        issues.append("unsupported URL")
    return {
        "grounded": not issues,
        "answer": answer,
        "used_chunk_ids": used if not issues else [],
        "issues": issues,
    }
