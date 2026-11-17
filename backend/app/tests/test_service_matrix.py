"""Data-driven coverage for every enabled service task.

The service files are the source of truth. These tests walk every task in both
languages, verify the public checklist contract, exercise every conditional
document branch, and check the fee catalog for every service.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.engine import fee_schedules
from app.services import loader

client = TestClient(app)

SERVICE_IDS = [service["service_id"] for service in loader.list_services()]
TASK_CASES = [
    (service_id, task["id"])
    for service_id in SERVICE_IDS
    for task in loader.get_service(service_id)["tasks"]
]


def _default_answers(questions: list[dict]) -> dict:
    answers: dict = {}
    for question in questions:
        if question["type"] == "number":
            answers[question["field"]] = int(question.get("min", 0))
        elif question["type"] == "select":
            answers[question["field"]] = question["options"][0]["value"]
        else:
            answers[question["field"]] = False
    return answers


def _condition_value(condition: dict, question: dict) -> object:
    operator = condition["operator"]
    expected = condition["value"]
    options = [option["value"] for option in question.get("options", [])]
    if question["type"] == "boolean":
        if operator == "eq":
            return bool(expected)
        if operator in {"ne"}:
            return not bool(expected)
        return False
    if question["type"] == "select":
        if operator == "eq":
            return expected
        if operator == "in":
            return expected[0]
        if operator == "ne":
            return next(value for value in options if value != expected)
        if operator == "not_in":
            return next(value for value in options if value not in expected)
        return options[0]
    # Number
    low = int(question.get("min", 0))
    high = int(question.get("max", 120))
    if operator == "eq":
        return int(expected)
    if operator == "ne":
        return low if int(expected) != low else min(high, low + 1)
    if operator == "lt":
        return max(low, int(expected) - 1)
    if operator == "lte":
        return min(high, int(expected))
    if operator == "gt":
        return min(high, int(expected) + 1)
    if operator == "gte":
        return max(low, int(expected))
    if operator == "in":
        return int(expected[0])
    if operator == "not_in":
        return low if low not in expected else min(high, low + 1)
    return low


def _answers_for_reference(service: dict, task: dict, reference: dict) -> dict:
    questions = {question["field"]: question for question in task.get("questions", [])}
    answers = _default_answers(task.get("questions", []))
    for condition in reference.get("conditions", []):
        question = questions[condition["field"]]
        answers[condition["field"]] = _condition_value(condition, question)
    return answers


def _assert_doc_contract(document: dict) -> None:
    assert document["id"]
    assert document["label_bn"].strip()
    assert document["label_en"].strip()
    assert document["notes_bn"].strip()
    assert document["notes_en"].strip()
    assert document["source_url"].startswith("https://")
    assert len(document["last_verified"]) == 10


def test_every_service_and_task_is_in_the_catalog():
    response = client.get("/api/services")
    assert response.status_code == 200
    body = response.json()
    catalog_ids = {service["service_id"] for service in body["services"]}
    assert catalog_ids == set(SERVICE_IDS)
    assert len(SERVICE_IDS) == 6
    assert len(TASK_CASES) == 24
    for service in body["services"]:
        assert service["source_url"].startswith("https://")
        assert service["last_verified"]
        assert service["tasks"]
        for task in service["tasks"]:
            assert task["label_bn"].strip()
            assert task["label_en"].strip()


@pytest.mark.parametrize("service_id,task_id", TASK_CASES)
def test_every_task_checklist_passes_in_both_languages(service_id: str, task_id: str):
    detail = client.get(f"/api/services/{service_id}").json()
    task = next(item for item in detail["tasks"] if item["id"] == task_id)
    answers = _default_answers(task.get("questions", []))
    allowed_docs = {document["id"] for document in task["documents"]}

    for language in ("bn", "en"):
        response = client.post(
            f"/api/services/{service_id}/checklist",
            json={"task": task_id, "answers": answers, "language": language},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["service_id"] == service_id
        assert body["task_id"] == task_id
        assert body["task_label_bn"].strip()
        assert body["task_label_en"].strip()
        assert body["source_url"].startswith("https://")
        assert body["last_verified"]
        assert body["official_links"]
        assert isinstance(body["steps"], list)
        assert isinstance(body["warnings"], list)
        assert body["fallback_used"] is False
        returned_ids = {document["id"] for document in body["documents"]}
        assert returned_ids <= allowed_docs
        for document in body["documents"]:
            _assert_doc_contract(document)


@pytest.mark.parametrize("service_id,task_id", TASK_CASES)
def test_every_conditional_document_branch_can_be_produced(service_id: str, task_id: str):
    service = loader.get_service(service_id)
    task = next(item for item in service["tasks"] if item["id"] == task_id)
    for reference in task["documents"]:
        if not reference.get("conditions"):
            continue
        answers = _answers_for_reference(service, task, reference)
        response = client.post(
            f"/api/services/{service_id}/checklist",
            json={"task": task_id, "answers": answers, "language": "en"},
        )
        assert response.status_code == 200, (service_id, task_id, reference, response.text)
        ids = {document["id"] for document in response.json()["documents"]}
        assert reference["id"] in ids, f"{service_id}/{task_id}/{reference['id']} not produced"


@pytest.mark.parametrize("service_id", SERVICE_IDS)
def test_service_detail_has_bilingual_steps_and_sources(service_id: str):
    response = client.get(f"/api/services/{service_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["service_name_bn"].strip()
    assert body["service_name_en"].strip()
    assert body["source_url"].startswith("https://")
    assert body["last_verified"]
    for task in body["tasks"]:
        assert task["steps_bn"]
        assert task["steps_en"]
        assert task["warnings_bn"] is not None
        assert task["warnings_en"] is not None
        for question in task["questions"]:
            assert question["label_bn"].strip()
            assert question["label_en"].strip()
            if question["type"] == "select":
                assert question["options"]
                for option in question["options"]:
                    assert option["label_bn"].strip()
                    assert option["label_en"].strip()


@pytest.mark.parametrize("service_id", SERVICE_IDS)
def test_status_guide_is_available_or_explains_absence(service_id: str):
    response = client.get(f"/api/services/{service_id}/status-guide")
    if service_id == "epassport":
        assert response.status_code == 200
        body = response.json()
        assert body["service_id"] == service_id
        assert body["source_url"].startswith("https://")
        assert body["last_verified"]
        assert body["statuses"]
        assert body["tips"]
        assert body["fraud_warnings"]
        for item in body["statuses"] + body["tips"] + body["fraud_warnings"]:
            assert item["text_bn"].strip()
            assert item["text_en"].strip()
            assert item["source_url"].startswith("https://")
            assert item["last_verified"]
    else:
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "GUIDANCE_NOT_FOUND"


def test_fee_catalog_covers_every_service_with_verified_sources():
    response = client.get("/api/fee-schedules")
    assert response.status_code == 200
    body = response.json()
    services = {service["service_id"]: service for service in body["services"]}
    assert set(services) == set(SERVICE_IDS)
    for service in services.values():
        assert service["label_bn"].strip()
        assert service["label_en"].strip()
        assert service["source_url"].startswith("https://")
        assert service["last_verified"]
        assert service["available"] is True
        assert service["fee_rules"]
        for rule in service["fee_rules"]:
            assert rule["components"]
            assert sum(component["amount"] for component in rule["components"]) == rule["total"]


def test_fee_engine_calculates_each_published_rule():
    for service_id, service in fee_schedules.SERVICES.items():
        for rule in service["fee_rules"]:
            selection = dict(rule["selection"])
            for unit in rule.get("variable_components", []):
                selection.setdefault(unit["unit_field"], 0)
            result = fee_schedules.calculate(service_id, selection)
            assert result["total"] == rule["total"]
            assert result["source_url"].startswith("https://")
            assert result["last_verified"]
            for unit in rule.get("variable_components", []):
                extended = dict(selection)
                extended[unit["unit_field"]] = unit.get("min_units", 1)
                extra = fee_schedules.calculate(service_id, extended)
                assert extra["total"] == rule["total"] + unit["amount_per_unit"] * extended[unit["unit_field"]]


def test_every_service_task_rejects_unknown_task_and_answer_fields():
    for service_id, task_id in TASK_CASES:
        unknown_task = client.post(
            f"/api/services/{service_id}/checklist",
            json={"task": "not_a_task", "answers": {}},
        )
        assert unknown_task.status_code == 422
        unknown_answer = client.post(
            f"/api/services/{service_id}/checklist",
            json={"task": task_id, "answers": {"nid_number": "1234567890"}},
        )
        assert unknown_answer.status_code == 422
