import pytest

from app.engine.checklist import generate
from app.schemas import ServiceProfile


@pytest.mark.parametrize("scenario", ["first_time_adult", "minor", "renewal", "lost_passport"])
def test_known_applicant_scenarios_have_sourced_identity_document(scenario):
    result = generate(ServiceProfile(applicant_type=scenario, language="en"))
    assert result["documents"]
    assert result["documents"][0]["id"] == "identity_record"
    assert result["documents"][0]["source_url"].startswith("https://")
    assert result["documents"][0]["last_verified"]
    assert result["steps"] and result["payment_channels"]
    assert result["warnings"]


def test_reissue_requires_previous_passport():
    result = generate(ServiceProfile(applicant_type="renewal", language="bn"))
    previous = next(document for document in result["documents"] if document["id"] == "previous_passport")
    assert previous["required"] is True


def test_checklist_has_bangla_steps_and_neutral_unverified_scope_notice():
    result = generate(ServiceProfile(applicant_type="minor", language="bn"))
    assert "আবেদন" in result["steps"][0]
    assert "সম্পূর্ণ নথির তালিকা জানতে" in result["warnings"][0]


def test_unknown_scenario_is_rejected():
    profile = ServiceProfile.model_construct(applicant_type="other", language="en")
    with pytest.raises(ValueError, match="Unsupported"):
        generate(profile)


def test_under_six_minor_requires_photo():
    result = generate(ServiceProfile(applicant_type="minor", age=5, pages=48, validity_years=5))
    photo = next(document for document in result["documents"] if document["id"] == "child_photo")
    assert photo["required"] is True


def test_minor_official_page_and_validity_limit_is_enforced():
    with pytest.raises(ValueError, match="48 pages and 5-year"):
        ServiceProfile(applicant_type="minor", age=10, pages=64, validity_years=5)


def test_parent_nid_is_required_only_when_minor_has_no_own_nid():
    without_nid = generate(ServiceProfile(applicant_type="minor", age=10, has_nid=False, language="en"))
    with_nid = generate(ServiceProfile(applicant_type="minor", age=10, has_nid=True, language="en"))
    parent_doc = lambda result: next(item for item in result["documents"] if item["id"] == "parent_nid")
    assert parent_doc(without_nid)["required"] is True
    assert parent_doc(with_nid)["required"] is False


def test_lost_passport_checklist_asks_for_photocopy_and_gd_not_original():
    result = generate(ServiceProfile(applicant_type="lost_passport", language="en"))
    ids = {item["id"] for item in result["documents"]}
    assert "lost_previous_copy" in ids
    assert "gd_report" in ids
    assert "previous_passport" not in ids
