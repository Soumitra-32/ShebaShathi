"""Deterministic application-step answers for the grounded copilot.

A named task can be answered from the validated service data without retrieval.
The steps are shown unchanged, in the requested language, so the language model
never decides or rewrites a procedure. This also covers natural task requests
such as "I need a passport for my infant" where the question names the task but
uses no retrieval word ("steps", "how", "process").
"""
from __future__ import annotations

from typing import Any

from ..intake.engine import detect_service, detect_task
from ..services import loader

_PROCESS_TERMS = (
    "how do i", "how to", "how can i", "steps", "step", "process", "procedure",
    "apply for", "renew", "renewal", "reissue", "re-issue",
    "what do i need to do", "what should i do",
    "কীভাবে", "কিভাবে", "প্রক্রিয়া", "পদ্ধতি", "ধাপ", "নবায়ন",
)

# A broad "I need a passport for my infant" request also implies the steps.
# Keep this narrow: an eligibility question such as "can my child get a
# passport without a birth certificate?" must not be replaced by a procedure.
_REQUEST_TERMS = (
    "i need", "i want", "i would like", "i'd like", "help me get",
    "i am trying to get", "i'm trying to get",
    "লাগবে", "চাই", "নিতে চাই", "করতে চাই", "আবেদন করতে চাই",
)

# A question about another task facet (fee, documents, photo, status) is left
# to that deterministic tool. If that tool cannot answer, this tool must not
# silently replace it with a procedure.
_OTHER_TASK_TERMS = (
    "fee", "fees", "cost", "costs", "price", "prices", "taka", "tk", "bdt",
    "document", "documents", "paper", "papers", "paperwork", "requirement",
    "requirements", "checklist", "photo", "photograph", "photographs",
    "status", "track", "tracking", "delivery", "waiting time", "processing time",
    "ফি", "টাকা", "মূল্য", "কাগজ", "কাগজপত্র", "নথি", "ছবি", "ফটো", "অবস্থা",
    "স্ট্যাটাস", "ডেলিভারি", "সময়",
)

_ELIGIBILITY_TERMS = (
    "whether", "can i", "can my", "am i", "eligible", "eligibility", "allowed",
    "without", "must i", "need to know", "is it possible", "do i qualify",
    "qualify", "কিনা", "পারব", "পারে", "যোগ্য", "প্রয়োজন কি", "লাগবে কি",
)


def _task_steps(task: dict[str, Any], language: str) -> list[str]:
    key = "steps_bn" if language == "bn" else "steps_en"
    return [step for step in task.get(key, []) if isinstance(step, str) and step.strip()]


def _citation(service: dict[str, Any], task: dict[str, Any], steps: list[str]) -> dict[str, str]:
    return {
        "title": f"{service['service_name_en']} — application steps",
        "url": service["source_url"],
        "last_verified": service["last_verified"],
        "quote_snippet": f"{task['label_en']}: " + " ".join(steps)[:260],
    }


def _format(
    service: dict[str, Any],
    task: dict[str, Any],
    language: str,
) -> dict[str, Any] | None:
    steps = _task_steps(task, language)
    if not steps:
        return None
    numbered = [f"{index}. {step}" for index, step in enumerate(steps, start=1)]
    steps_text = " ".join(numbered).rstrip(" .।")
    if language == "bn":
        answer = (
            f"{task['label_bn']}-এর প্রকাশিত ধাপ: "
            + steps_text
            + f"। সূত্র: {service['source_url']} (যাচাই: {service['last_verified']})।"
        )
    else:
        answer = (
            f"Published steps for {task['label_en']}: "
            + steps_text
            + f". Source: {service['source_url']} (verified {service['last_verified']})."
        )
    return {
        "answer": answer,
        "citations": [_citation(service, task, steps)],
        "grounded": True,
        "answer_found": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }


def answer(
    question: str,
    service_id: str | None = None,
    language: str = "bn",
) -> dict[str, Any] | None:
    """Return deterministic steps for a clearly named task, or ``None``."""
    value = (question or "").casefold()
    if not value.strip() or any(term in value for term in _OTHER_TASK_TERMS):
        return None
    if any(term in value for term in _ELIGIBILITY_TERMS):
        return None
    asks_for_steps = any(term in value for term in _PROCESS_TERMS)
    asks_for_task = any(term in value for term in _REQUEST_TERMS)
    if not asks_for_steps and not asks_for_task:
        return None
    resolved = service_id or detect_service(question)
    if not resolved:
        return None
    task_id = detect_task(question, resolved)
    if not task_id:
        return None
    try:
        service = loader.get_service(resolved)
    except (KeyError, RuntimeError):
        return None
    task = next(
        (item for item in service.get("tasks", []) if item.get("id") == task_id),
        None,
    )
    if task is None:
        return None
    return _format(service, task, language)
