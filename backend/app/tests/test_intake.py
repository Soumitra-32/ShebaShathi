"""AI intake router: routing, validation, safety and fallback tests."""
from fastapi.testclient import TestClient

from app.intake import engine
from app.main import app


client = TestClient(app)


def _intake(text: str, language: str = "bn"):
    return client.post("/api/intake", json={"text": text, "language": language})


def test_bangla_child_passport_routes_to_minor_and_extracts_age():
    response = _intake("আমার ৫ বছরের ছেলের পাসপোর্ট লাগবে, ওর নিজের NID নেই")
    assert response.status_code == 200
    body = response.json()
    assert body["service_id"] == "epassport"
    assert body["task_id"] == "minor"
    assert body["answers"] == {"age": 5, "has_own_nid": False}
    assert body["missing_fields"] == []
    assert body["generation_mode"] == "rules"
    assert body["fallback_used"] is True


def test_english_lost_passport_routes_to_lost_task():
    body = _intake("My passport was lost. What should I do?", "en").json()
    assert body["service_id"] == "epassport"
    assert body["task_id"] == "lost_passport"
    assert body["missing_fields"] == []


def test_birth_registration_extracts_age():
    body = _intake("birth registration for my 2 year old child", "en").json()
    assert body["service_id"] == "birth_registration"
    assert body["task_id"] == "new_registration"
    assert body["answers"]["age"] == 2


def test_nid_correction_parent_name_uses_allowed_option():
    body = _intake("NID correction for my father name", "en").json()
    assert body["service_id"] == "nid"
    assert body["task_id"] == "correction"
    assert body["answers"]["correction_type"] == "parents_name"


def test_driving_renewal_extracts_professional_boolean():
    body = _intake("I want a driving licence renewal, non-professional", "en").json()
    assert body["service_id"] == "driving_licence"
    assert body["task_id"] == "renewal"
    assert body["answers"]["professional"] is False


def test_ambiguous_text_returns_service_options_instead_of_guessing():
    body = _intake("hello", "en").json()
    assert body["service_id"] is None
    assert body["task_id"] is None
    assert len(body["service_options"]) == 5
    assert body["confidence"] == 0.0


def test_service_without_task_returns_task_options():
    body = _intake("passport", "en").json()
    assert body["service_id"] == "epassport"
    assert body["task_id"] is None
    assert {item["value"] for item in body["task_options"]} == {
        "first_time_adult", "minor", "renewal", "lost_passport",
    }


def test_confirmed_service_override_does_not_call_the_model(monkeypatch):
    monkeypatch.setattr(engine.llm, "is_configured", lambda: True)
    monkeypatch.setattr(engine.llm, "completion", lambda *a, **k: (_ for _ in ()).throw(AssertionError("model called")))
    body = client.post("/api/intake", json={
        "text": "hello", "language": "en", "service_id": "epassport",
    }).json()
    assert body["service_id"] == "epassport"
    assert body["task_id"] is None
    assert body["generation_mode"] == "confirmed"
    assert body["fallback_used"] is False
    assert {item["value"] for item in body["task_options"]} == {
        "first_time_adult", "minor", "renewal", "lost_passport",
    }


def test_confirmed_task_override_extracts_answers_deterministically():
    body = client.post("/api/intake", json={
        "text": "my 5 year old child needs a passport",
        "language": "en",
        "service_id": "epassport",
        "task_id": "minor",
    }).json()
    assert body["service_id"] == "epassport"
    assert body["task_id"] == "minor"
    assert body["answers"]["age"] == 5
    assert body["generation_mode"] == "confirmed"
    assert body["fallback_used"] is False


def test_confirmed_task_that_does_not_belong_to_service_is_rejected_safely():
    body = client.post("/api/intake", json={
        "text": "hello", "language": "en",
        "service_id": "epassport", "task_id": "not_a_task",
    }).json()
    assert body["service_id"] == "epassport"
    assert body["task_id"] is None
    assert body["task_options"]
    assert body["confidence"] == 0.5
    assert body["generation_mode"] == "confirmed"


def test_identity_number_is_rejected_before_any_model_call():
    response = client.post("/api/intake", json={"text": "NID 1234567890 correction", "language": "en"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "IDENTITY_DATA_REJECTED"


def test_extra_request_fields_are_rejected():
    response = client.post("/api/intake", json={
        "text": "passport", "language": "en", "profile": {"nid": "123"},
    })
    assert response.status_code == 422


def test_unsafe_intake_is_blocked_without_routing():
    body = _intake("Which agent is fastest for passport?", "en").json()
    assert body["blocked"] is True
    assert body["generation_mode"] == "blocked"
    assert body["service_id"] is None
    assert "agent" in body["message_en"].lower()


def test_llm_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setattr(engine.llm, "is_configured", lambda: True)

    def fail(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(engine.llm, "completion", fail)
    body = engine.route("আমার পাসপোর্ট হারিয়ে গেছে", "bn")
    assert body["service_id"] == "epassport"
    assert body["task_id"] == "lost_passport"
    assert body["generation_mode"] == "rules"


def test_llm_cannot_invent_a_service(monkeypatch):
    monkeypatch.setattr(engine.llm, "is_configured", lambda: True)
    monkeypatch.setattr(engine.llm, "completion", lambda *a, **k: {
        "parsed": {"service_id": "not_a_service", "task_id": "x", "confidence": 0.99, "answers": {}},
    })
    body = engine.route("passport", "en")
    assert body["service_id"] == "epassport"
    assert body["generation_mode"] == "rules"


def test_llm_minor_age_over_18_is_dropped(monkeypatch):
    monkeypatch.setattr(engine.llm, "is_configured", lambda: True)
    monkeypatch.setattr(engine.llm, "completion", lambda *a, **k: {
        "parsed": {
            "service_id": "epassport", "task_id": "minor", "confidence": 0.9,
            "answers": {"age": 25, "has_own_nid": False},
        },
    })
    body = engine.route("my child needs a passport", "en")
    assert body["task_id"] == "minor"
    assert "age" not in body["answers"]
    assert "age" in body["missing_fields"]


def test_model_service_with_an_ambiguous_second_service_still_gets_the_task(monkeypatch):
    # "passport" and "NID" both appear, so a full rule route sees a service tie.
    # The model already chose the service; deterministic task words still apply.
    monkeypatch.setattr(engine.llm, "is_configured", lambda: True)
    monkeypatch.setattr(engine, "_llm_route", lambda text: ("epassport", None, {}, 0.8))
    body = engine.route(
        "My 5 year old child needs a passport and does not have a NID", "en"
    )
    assert body["service_id"] == "epassport"
    assert body["task_id"] == "minor"
    assert body["answers"] == {"age": 5, "has_own_nid": False}
    assert body["generation_mode"] == "api"
    assert body["fallback_used"] is False
