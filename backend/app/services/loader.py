"""Service catalog loader and contract validator.

Every user-facing rule must carry a ``service_id``, an ``https`` ``source_url``
and a ``last_verified`` date. The loader fails closed: an invalid file raises
``ServiceContractError`` and is never served.
"""
from __future__ import annotations

import json
import re
from . import freshness as freshness_helper
from datetime import date
from pathlib import Path
from typing import Any

SERVICES_DIR = Path(__file__).resolve().parents[3] / "data" / "services"
INDEX_FILE = SERVICES_DIR / "index.json"

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_FIELD_RE = re.compile(r"^[a-z][a-z0-9_]{0,40}$")
_OPERATORS = {"eq", "ne", "in", "not_in", "lt", "lte", "gt", "gte"}


class ServiceContractError(RuntimeError):
    """Raised when a service data file violates the rule contract."""


def _fail(service_id: str, message: str) -> None:
    raise ServiceContractError(f"{service_id}: {message}")


def _require_text(service_id: str, value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(service_id, f"{path} must be a non-empty string")
    return value.strip()


def _require_https(service_id: str, value: Any, path: str) -> str:
    text = _require_text(service_id, value, path)
    if not text.startswith("https://"):
        _fail(service_id, f"{path} must be an https URL")
    return text


def _require_date(service_id: str, value: Any, path: str) -> str:
    text = _require_text(service_id, value, path)
    if not _DATE_RE.match(text):
        _fail(service_id, f"{path} must be a YYYY-MM-DD date")
    try:
        date.fromisoformat(text)
    except ValueError:
        _fail(service_id, f"{path} is not a real date")
    return text


def _validate_links(service_id: str, links: Any, path: str) -> list[dict]:
    if not isinstance(links, list):
        _fail(service_id, f"{path} must be a list")
    for index, link in enumerate(links):
        if not isinstance(link, dict):
            _fail(service_id, f"{path}[{index}] must be an object")
        _require_text(service_id, link.get("label_bn"), f"{path}[{index}].label_bn")
        _require_text(service_id, link.get("label_en"), f"{path}[{index}].label_en")
        _require_https(service_id, link.get("url"), f"{path}[{index}].url")
    return links


def _validate_question(service_id: str, question: Any, path: str) -> str:
    if not isinstance(question, dict):
        _fail(service_id, f"{path} must be an object")
    field = _require_text(service_id, question.get("field"), f"{path}.field")
    if not _FIELD_RE.match(field):
        _fail(service_id, f"{path}.field must be a simple snake_case identifier")
    qtype = question.get("type")
    if qtype not in {"number", "select", "boolean"}:
        _fail(service_id, f"{path}.type must be number, select or boolean")
    _require_text(service_id, question.get("label_bn"), f"{path}.label_bn")
    _require_text(service_id, question.get("label_en"), f"{path}.label_en")
    if qtype == "select":
        options = question.get("options")
        if not isinstance(options, list) or not options:
            _fail(service_id, f"{path}.options must be a non-empty list")
        for option in options:
            _require_text(service_id, option.get("value"), f"{path}.options[].value")
            _require_text(service_id, option.get("label_bn"), f"{path}.options[].label_bn")
            _require_text(service_id, option.get("label_en"), f"{path}.options[].label_en")
    return field


def _validate_condition(service_id: str, condition: Any, path: str, declared_fields: set[str]) -> None:
    if not isinstance(condition, dict):
        _fail(service_id, f"{path} must be an object")
    field = _require_text(service_id, condition.get("field"), f"{path}.field")
    if field not in declared_fields:
        _fail(service_id, f"{path}.field '{field}' is not declared in questions")
    operator = condition.get("operator")
    if operator not in _OPERATORS:
        _fail(service_id, f"{path}.operator is unsupported")
    if "value" not in condition:
        _fail(service_id, f"{path}.value is required")


def _validate_document_catalog(service_id: str, documents: Any) -> dict[str, dict]:
    if not isinstance(documents, list):
        _fail(service_id, "documents must be a list")
    catalog: dict[str, dict] = {}
    for index, doc in enumerate(documents):
        path = f"documents[{index}]"
        if not isinstance(doc, dict):
            _fail(service_id, f"{path} must be an object")
        doc_id = _require_text(service_id, doc.get("id"), f"{path}.id")
        if doc_id in catalog:
            _fail(service_id, f"duplicate document id '{doc_id}'")
        _require_text(service_id, doc.get("label_bn"), f"{path}.label_bn")
        _require_text(service_id, doc.get("label_en"), f"{path}.label_en")
        _require_text(service_id, doc.get("notes_bn"), f"{path}.notes_bn")
        _require_text(service_id, doc.get("notes_en"), f"{path}.notes_en")
        _require_https(service_id, doc.get("source_url"), f"{path}.source_url")
        _require_date(service_id, doc.get("last_verified"), f"{path}.last_verified")
        catalog[doc_id] = doc
    return catalog


def _validate_service(data: Any, expected_service_id: str) -> dict:
    if not isinstance(data, dict):
        _fail(expected_service_id, "service file must be a JSON object")
    service_id = _require_text(expected_service_id, data.get("service_id"), "service_id")
    if service_id != expected_service_id:
        _fail(expected_service_id, "service_id must match the catalog entry")
    for key in (
        "service_name_bn", "service_name_en", "authority_bn", "authority_en",
        "summary_bn", "summary_en", "fallback_bn", "fallback_en",
    ):
        _require_text(service_id, data.get(key), key)
    _require_https(service_id, data.get("source_url"), "source_url")
    _require_date(service_id, data.get("last_verified"), "last_verified")
    _validate_links(service_id, data.get("official_links", []), "official_links")
    catalog = _validate_document_catalog(service_id, data.get("documents", []))

    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        _fail(service_id, "tasks must be a non-empty list")
    seen_tasks: set[str] = set()
    for t_index, task in enumerate(tasks):
        path = f"tasks[{t_index}]"
        if not isinstance(task, dict):
            _fail(service_id, f"{path} must be an object")
        task_id = _require_text(service_id, task.get("id"), f"{path}.id")
        if task_id in seen_tasks:
            _fail(service_id, f"duplicate task id '{task_id}'")
        seen_tasks.add(task_id)
        _require_text(service_id, task.get("label_bn"), f"{path}.label_bn")
        _require_text(service_id, task.get("label_en"), f"{path}.label_en")
        for list_key in ("steps_bn", "steps_en", "warnings_bn", "warnings_en"):
            values = task.get(list_key, [])
            if not isinstance(values, list) or not all(isinstance(item, str) and item.strip() for item in values):
                _fail(service_id, f"{path}.{list_key} must be a list of non-empty strings")
        _validate_links(service_id, task.get("official_links", []), f"{path}.official_links")

        declared_fields: set[str] = set()
        for q_index, question in enumerate(task.get("questions", [])):
            field = _validate_question(service_id, question, f"{path}.questions[{q_index}]")
            if field in declared_fields:
                _fail(service_id, f"{path} declares question '{field}' twice")
            declared_fields.add(field)

        references = task.get("documents")
        if not isinstance(references, list):
            _fail(service_id, f"{path}.documents must be a list")
        for r_index, reference in enumerate(references):
            ref_path = f"{path}.documents[{r_index}]"
            if not isinstance(reference, dict):
                _fail(service_id, f"{ref_path} must be an object")
            doc_id = _require_text(service_id, reference.get("id"), f"{ref_path}.id")
            if doc_id not in catalog:
                _fail(service_id, f"{ref_path}.id '{doc_id}' is not in the document catalog")
            if not isinstance(reference.get("required"), bool):
                _fail(service_id, f"{ref_path}.required must be a boolean")
            for c_index, condition in enumerate(reference.get("conditions", [])):
                _validate_condition(service_id, condition, f"{ref_path}.conditions[{c_index}]", declared_fields)
    return data


def _load_index() -> dict:
    with INDEX_FILE.open(encoding="utf-8") as source:
        index = json.load(source)
    if not isinstance(index, dict) or not isinstance(index.get("services"), list):
        raise ServiceContractError("services/index.json is malformed")
    return index


def _load_all() -> dict[str, dict]:
    index = _INDEX
    catalog: dict[str, dict] = {}
    for entry in index["services"]:
        service_id = _require_text("catalog", entry.get("service_id"), "services[].service_id")
        data_file = _require_text(service_id, entry.get("data_file"), "data_file")
        if not isinstance(entry.get("enabled"), bool):
            _fail(service_id, "enabled must be a boolean")
        path = SERVICES_DIR / data_file
        if not path.exists():
            _fail(service_id, f"data file '{data_file}' does not exist")
        with path.open(encoding="utf-8") as source:
            data = json.load(source)
        validated = _validate_service(data, service_id)
        validated["enabled"] = entry["enabled"]
        catalog[service_id] = validated
    return catalog


# The catalog is small and static; load and validate it once at import time.
_INDEX: dict = _load_index()
_SERVICES: dict[str, dict] = _load_all()


def catalog_meta() -> dict:
    """Public, non-sensitive catalog metadata (version, dates, disclaimers)."""
    return {
        "catalog_version": _INDEX.get("catalog_version"),
        "last_updated": _INDEX.get("last_updated"),
        "disclaimer_bn": _INDEX.get("disclaimer_bn"),
        "disclaimer_en": _INDEX.get("disclaimer_en"),
    }


def list_services(include_disabled: bool = False) -> list[dict]:
    return [
        _summary(service)
        for service in _SERVICES.values()
        if include_disabled or service["enabled"]
    ]


def get_service(service_id: str) -> dict:
    service = _SERVICES.get(service_id)
    if service is None or not service["enabled"]:
        raise KeyError(service_id)
    return service


def is_enabled(service_id: str) -> bool:
    service = _SERVICES.get(service_id)
    return bool(service and service["enabled"])


def _summary(service: dict) -> dict:
    return {
        "service_id": service["service_id"],
        "service_name_bn": service["service_name_bn"],
        "service_name_en": service["service_name_en"],
        "authority_bn": service["authority_bn"],
        "authority_en": service["authority_en"],
        "summary_bn": service["summary_bn"],
        "summary_en": service["summary_en"],
        "source_url": service["source_url"],
        "last_verified": service["last_verified"],
        "review_status": freshness_helper.freshness(service)["status"],
        "review_after_days": freshness_helper.REVIEW_AFTER_DAYS,
        "enabled": service["enabled"],
        "fallback_bn": service["fallback_bn"],
        "fallback_en": service["fallback_en"],
        "official_links": service["official_links"],
        "tasks": [
            {"id": task["id"], "label_bn": task["label_bn"], "label_en": task["label_en"]}
            for task in service["tasks"]
        ],
    }


def service_detail(service_id: str) -> dict:
    """Full, validated guide content without the internal document catalog internals."""
    service = get_service(service_id)
    return {
        **_summary(service),
        "tasks": [
            {
                "id": task["id"],
                "label_bn": task["label_bn"],
                "label_en": task["label_en"],
                "questions": task.get("questions", []),
                "steps_bn": task["steps_bn"],
                "steps_en": task["steps_en"],
                "warnings_bn": task["warnings_bn"],
                "warnings_en": task["warnings_en"],
                "official_links": task.get("official_links", []),
            }
            for task in service["tasks"]
        ],
    }
