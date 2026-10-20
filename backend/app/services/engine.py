"""Deterministic service checklist engine.

Turns a minimal set of non-sensitive answers into a source-dated checklist.
The engine never invents documents: it only selects from validated service data.
"""
from __future__ import annotations

from . import freshness as freshness_helper
from . import loader


class ChecklistInputError(ValueError):
    """Raised for unknown tasks or unsupported answer fields."""


def _coerce_answers(service: dict, task: dict, answers: dict) -> dict:
    questions = {question["field"]: question for question in task.get("questions", [])}
    if not isinstance(answers, dict):
        raise ChecklistInputError("answers must be an object")
    for field in answers:
        if field not in questions:
            raise ChecklistInputError(f"Unsupported answer field: {field}")

    cleaned: dict = {}
    for field, question in questions.items():
        value = answers.get(field)
        if value is None:
            if question.get("required"):
                raise ChecklistInputError(f"Missing required answer: {field}")
            continue
        qtype = question["type"]
        if qtype == "boolean":
            if not isinstance(value, bool):
                raise ChecklistInputError(f"{field} must be true or false")
        elif qtype == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ChecklistInputError(f"{field} must be a number")
            if question.get("min") is not None and value < question["min"]:
                raise ChecklistInputError(f"{field} is below the allowed range")
            if question.get("max") is not None and value > question["max"]:
                raise ChecklistInputError(f"{field} is above the allowed range")
        elif qtype == "select":
            allowed = {option["value"] for option in question.get("options", [])}
            if value not in allowed:
                raise ChecklistInputError(f"{field} has an unsupported value")
        cleaned[field] = value
    return cleaned


def _matches(condition: dict, answers: dict) -> bool:
    if condition["field"] not in answers:
        return False
    actual = answers[condition["field"]]
    expected = condition["value"]
    operator = condition["operator"]
    if operator == "eq":
        return actual == expected
    if operator == "ne":
        return actual != expected
    if operator == "in":
        return isinstance(expected, list) and actual in expected
    if operator == "not_in":
        return isinstance(expected, list) and actual not in expected
    try:
        left, right = float(actual), float(expected)
    except (TypeError, ValueError):
        return False
    return {
        "lt": left < right,
        "lte": left <= right,
        "gt": left > right,
        "gte": left >= right,
    }[operator]


def _task(service: dict, task_id: str) -> dict:
    for task in service["tasks"]:
        if task["id"] == task_id:
            return task
    raise ChecklistInputError(f"Unsupported task: {task_id}")


def generate(service_id: str, task_id: str, answers: dict, language: str = "bn") -> dict:
    service = loader.get_service(service_id)
    task = _task(service, task_id)
    cleaned = _coerce_answers(service, task, answers)

    catalog = {document["id"]: document for document in service["documents"]}
    documents = []
    for reference in task["documents"]:
        if all(_matches(condition, cleaned) for condition in reference.get("conditions", [])):
            source = catalog[reference["id"]]
            documents.append({
                "id": source["id"],
                "label_bn": source["label_bn"],
                "label_en": source["label_en"],
                "required": reference["required"],
                "notes_bn": source["notes_bn"],
                "notes_en": source["notes_en"],
                "source_url": source["source_url"],
                "last_verified": source["last_verified"],
            })

    is_bn = language == "bn"
    return {
        "service_id": service_id,
        "task_id": task["id"],
        "task_label_bn": task["label_bn"],
        "task_label_en": task["label_en"],
        "documents": documents,
        "steps": task["steps_bn"] if is_bn else task["steps_en"],
        "warnings": task["warnings_bn"] if is_bn else task["warnings_en"],
        "official_links": task.get("official_links", []),
        "source_url": service["source_url"],
        "last_verified": service["last_verified"],
        "review_status": freshness_helper.freshness(service)["status"],
        "review_after_days": freshness_helper.REVIEW_AFTER_DAYS,
        "fallback_used": False,
    }
