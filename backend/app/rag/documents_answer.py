"""Deterministic document-checklist answers for the grounded copilot.

Document questions are the largest no-key failure mode: retrieval can return a
nearby chunk that mentions a passport or a certificate but not the requested
checklist. This module builds the answer from the validated service data, so
the model never chooses a document and the answer stays grounded when no
provider is configured.

The tool answers one named task when the question clearly selects it. Otherwise
it shows the service's tasks grouped by their published document lists, so an
"exactly which papers?" question still gets a useful, source-dated overview
instead of an unrelated excerpt.
"""
from __future__ import annotations

from typing import Any

from ..intake.engine import detect_service, detect_task
from ..services import loader

_DOCUMENT_TERMS = (
    "document", "documents", "paper", "papers", "paperwork", "requirement",
    "requirements", "proof", "what do i need", "what to bring", "checklist",
    "কাগজ", "কাগজপত্র", "নথি", "প্রমাণ", "প্রয়োজন", "কী লাগে", "কি লাগে",
    "কী কী লাগে", "কি কি লাগে", "কী কী কাগজ", "kagaj", "kagoj", "nothi", "proyojon",
)


def _is_document_question(question: str) -> bool:
    value = (question or "").casefold()
    return any(term in value for term in _DOCUMENT_TERMS)


def _condition_label(condition: dict[str, Any], task: dict[str, Any], language: str) -> str:
    field = condition.get("field", "")
    operator = condition.get("operator", "eq")
    value = condition.get("value")
    is_bn = language == "bn"
    labels = {
        ("age", "lt", 5): ("৫ বছরের কম বয়সী", "under 5 years old"),
        ("age", "gte", 5): ("৫ বছর বা তার বেশি বয়সী", "5 years old or older"),
        ("age", "lt", 6): ("৬ বছরের কম বয়সী শিশু", "a child under 6"),
        ("has_own_nid", "eq", False): ("সন্তানের নিজের NID না থাকলে", "if the child has no own NID"),
        ("professional", "eq", True): ("পেশাদার লাইসেন্সের জন্য", "for a professional licence"),
        ("related_to_deceased", "eq", False): ("মৃতের সাথে সম্পর্ক না থাকলে", "if the applicant is not related to the deceased"),
        ("has_representative", "eq", True): ("প্রতিনিধির মাধ্যমে আবেদন করলে", "if applying through a representative"),
        ("source_type", "eq", "purchase"): ("জমি কিনে থাকলে", "for purchased land"),
        ("source_type", "eq", "decree"): ("আদালতের আদেশে মালিকানা হলে", "when ownership comes from a court decree"),
        ("source_type", "eq", "inheritance"): ("উত্তরাধিকারে মালিকানা হলে", "for inherited land"),
        ("source_type", "in", ("gift", "auction", "settlement", "other")): ("অন্য উৎস থেকে মালিকানা হলে", "for another ownership source"),
    }
    key = (field, operator, tuple(value) if isinstance(value, list) else value)
    if key in labels:
        return labels[key][0 if is_bn else 1]
    # Fall back to the published question label rather than a raw field name.
    for question in task.get("questions", []):
        if question.get("field") == field:
            return question["label_bn" if is_bn else "label_en"]
    return field


def _document_line(
    reference: dict[str, Any],
    documents: dict[str, Any],
    task: dict[str, Any],
    language: str,
) -> str | None:
    document = documents.get(reference.get("id"))
    if document is None:
        return None
    is_bn = language == "bn"
    label = document["label_bn" if is_bn else "label_en"]
    suffix = []
    if reference.get("required") is False:
        suffix.append("ঐচ্ছিক" if is_bn else "optional")
    for condition in reference.get("conditions", []):
        condition_text = _condition_label(condition, task, language)
        # Avoid repeating a condition already stated in the published label
        # (for example \"3R photograph for a child under six\").
        if condition.get("field") == "age" and "under" in label.casefold():
            continue
        if condition_text.casefold() not in label.casefold():
            suffix.append(condition_text)
    if suffix:
        return f"{label} ({'; '.join(suffix)})"
    return label


def _task_documents(task: dict[str, Any], service: dict[str, Any], language: str) -> list[str]:
    documents = {item["id"]: item for item in service.get("documents", [])}
    lines = []
    for reference in task.get("documents", []):
        line = _document_line(reference, documents, task, language)
        if line:
            lines.append(line)
    return lines


def _citation(service: dict[str, Any], quote: str) -> dict[str, str]:
    return {
        "title": f"{service['service_name_en']} — document checklist",
        "url": service["source_url"],
        "last_verified": service["last_verified"],
        "quote_snippet": quote[:300],
    }


def _format_task(service: dict[str, Any], task: dict[str, Any], language: str) -> dict[str, Any] | None:
    lines = _task_documents(task, service, language)
    if not lines:
        return None
    is_bn = language == "bn"
    if is_bn:
        answer = (
            f"{task['label_bn']}-এর জন্য প্রকাশিত নথির তালিকা: "
            + "; ".join(lines)
            + f"। সূত্র: {service['source_url']} (যাচাই: {service['last_verified']})।"
        )
    else:
        answer = (
            f"Published documents for {task['label_en']}: "
            + "; ".join(lines)
            + f". Source: {service['source_url']} (verified {service['last_verified']})."
        )
    quote = f"{task['label_en']}: " + "; ".join(
        document.get("label_en", "") for document in service.get("documents", [])
        if any(reference.get("id") == document.get("id") for reference in task.get("documents", []))
    )
    return {
        "answer": answer,
        "citations": [_citation(service, quote)],
        "grounded": True,
        "answer_found": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def _format_overview(service: dict[str, Any], language: str) -> dict[str, Any] | None:
    is_bn = language == "bn"
    blocks = []
    for task in service.get("tasks", []):
        lines = _task_documents(task, service, language)
        if not lines:
            continue
        heading = task["label_bn" if is_bn else "label_en"]
        blocks.append(f"{heading}: " + "; ".join(lines))
    if not blocks:
        return None
    if is_bn:
        answer = (
            "প্রকাশিত নথির তালিকা আবেদনের ধরন অনুযায়ী বদলায়। "
            + " | ".join(blocks)
            + f"। সূত্র: {service['source_url']} (যাচাই: {service['last_verified']})।"
        )
    else:
        answer = (
            "The published document list depends on the application type. "
            + " | ".join(blocks)
            + f". Source: {service['source_url']} (verified {service['last_verified']})."
        )
    quote = " | ".join(blocks)
    return {
        "answer": answer,
        "citations": [_citation(service, quote)],
        "grounded": True,
        "answer_found": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def answer(question: str, service_id: str | None = None, language: str = "bn") -> dict[str, Any] | None:
    """Return a deterministic document answer, or ``None`` to continue RAG."""
    if not _is_document_question(question):
        return None
    resolved = service_id or detect_service(question)
    if not resolved:
        return None
    try:
        service = loader.get_service(resolved)
    except (KeyError, RuntimeError):
        return None
    task_id = detect_task(question, resolved)
    if task_id:
        task = next((item for item in service.get("tasks", []) if item["id"] == task_id), None)
        if task is not None:
            result = _format_task(service, task, language)
            if result is not None:
                return result
    return _format_overview(service, language)
