"""Plain-language AI brief for a deterministic checklist.

The checklist engine decides every document, step and warning. This module only
asks the model to explain that already-verified checklist in simpler language.
The result is verified against the checklist text: unsupported numbers are
rejected and the deterministic checklist is returned instead. With no provider
configured it returns a readable deterministic summary, so the feature never
blocks the core flow.
"""
from __future__ import annotations

from typing import Any

from .. import llm
from ..services import loader
from . import verifier
from .prompts import plain_text

BRIEF_SYSTEM_PROMPT = """You are ShebaShathi, a patient Bangla-first guide for Bangladesh citizen services.
You will receive a VERIFIED CHECKLIST. It is the only source of truth.

Rules:
1. Use ONLY the checklist. Never add a document, fee, deadline, office, phone number, URL, law or eligibility rule.
2. Every number you write must already appear in the checklist.
3. Do not promise that an application will be accepted, and do not claim to be a government service.
4. Write in the requested language (bn = Bangla, en = English).
5. Write 120-180 words in plain, conversational language with three short parts:
   "What applies to you", "Do it in this order", "Avoid these mistakes".
   Use short sentences. If the checklist has no warnings, omit the third part.
   Use plain text only: no Markdown symbols such as **, #, backticks or * bullets.
6. Never ask for identity numbers, document images or credentials.
7. Return valid JSON only: {"brief": string}.
"""


def _source_chunks(checklist: dict[str, Any], service: dict[str, Any], language: str) -> list[dict[str, Any]]:
    text = _checklist_context(checklist, service, language)
    return [{
        "id": "verified-checklist",
        "text": text,
        "metadata": {
            "title": f"{service['service_name_en']} — verified checklist",
            "source_url": checklist["source_url"],
            "last_verified": checklist["last_verified"],
            "section": "checklist",
        },
    }]


def _checklist_context(checklist: dict[str, Any], service: dict[str, Any], language: str) -> str:
    is_bn = language == "bn"
    task = checklist["task_label_bn"] if is_bn else checklist["task_label_en"]
    lines = [
        f"Service: {service['service_name_bn'] if is_bn else service['service_name_en']}",
        f"Task: {task}",
        "Documents:",
    ]
    for document in checklist["documents"]:
        label = document["label_bn"] if is_bn else document["label_en"]
        notes = document["notes_bn"] if is_bn else document["notes_en"]
        required = "required" if document["required"] else "optional"
        lines.append(f"- {label} ({required}){': ' + notes if notes else ''}")
    lines.append("Steps:")
    lines.extend(f"{index}. {step}" for index, step in enumerate(checklist["steps"], start=1))
    if checklist["warnings"]:
        lines.append("Warnings:")
        lines.extend(f"- {warning}" for warning in checklist["warnings"])
    return "\n".join(lines)


def _deterministic_brief(checklist: dict[str, Any], service: dict[str, Any], language: str) -> str:
    is_bn = language == "bn"
    task = checklist["task_label_bn"] if is_bn else checklist["task_label_en"]
    name = service["service_name_bn"] if is_bn else service["service_name_en"]
    documents = ", ".join(
        document["label_bn"] if is_bn else document["label_en"] for document in checklist["documents"]
    )
    if is_bn:
        parts = [f"{name} — {task}।", f"প্রয়োজনীয় নথি: {documents}।" if documents else "এই কাজে আলাদা নথি লাগবে না।"]
        if checklist["steps"]:
            parts.append("ধাপগুলো: " + " ".join(f"{i}. {step}" for i, step in enumerate(checklist["steps"], 1)))
        if checklist["warnings"]:
            parts.append("সতর্কতা: " + " ".join(checklist["warnings"]))
        return "\n\n".join(parts)
    parts = [f"{name} — {task}.", f"Documents: {documents}." if documents else "No separate documents are listed for this task."]
    if checklist["steps"]:
        parts.append("Steps: " + " ".join(f"{i}. {step}" for i, step in enumerate(checklist["steps"], 1)))
    if checklist["warnings"]:
        parts.append("Warnings: " + " ".join(checklist["warnings"]))
    return "\n\n".join(parts)


def generate(checklist: dict[str, Any], service: dict[str, Any], language: str) -> dict[str, Any]:
    """Return an AI brief, a deterministic fallback, or both metadata fields."""
    fallback = _deterministic_brief(checklist, service, language)
    if not llm.is_configured():
        return {
            "brief": fallback,
            "grounded": True,
            "generation_mode": "extractive",
            "llm_provider": "none",
            "llm_model": None,
        }

    context = _checklist_context(checklist, service, language)
    prompt = (
        f"LANGUAGE: {language}\n\n"
        f"VERIFIED CHECKLIST (the only allowed facts):\n<<<\n{context}\n>>>\n\n"
        "Write the brief as the JSON object described in the system prompt."
    )
    try:
        response = llm.completion(
            [
                {"role": "system", "content": BRIEF_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=700,
        )
        parsed = response.get("parsed") or {}
        brief = parsed.get("brief") if isinstance(parsed, dict) else None
        if not isinstance(brief, str) or not brief.strip():
            raise llm.LLMProviderError("The language-model provider returned no brief.")
        brief = plain_text(brief)
        chunks = _source_chunks(checklist, service, language)
        verified = verifier.verify(
            {"answer": brief, "used_chunk_ids": [chunks[0]["id"]], "retrieved_chunks": chunks},
            None,
        )
        if not verified.get("grounded"):
            raise llm.LLMProviderError("The generated brief added unsupported facts.")
        return {
            "brief": verified["answer"],
            "grounded": True,
            "generation_mode": "api",
            "llm_provider": llm.provider_name(),
            "llm_model": response.get("model") or llm.model_id(),
        }
    except Exception:  # noqa: BLE001 - the verified checklist must still be usable
        return {
            "brief": fallback,
            "grounded": True,
            "generation_mode": "extractive",
            "llm_provider": "none",
            "llm_model": None,
        }
