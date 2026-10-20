from app.drafter.grs import PORTAL_URL, generate
from app.schemas import GRSDraftRequest


def test_bangla_complaint_contains_user_facts_once_and_keeps_blank_identity_fields():
    request = GRSDraftRequest(
        incident_date="2026-10-02", location="ঢাকা আঞ্চলিক পাসপোর্ট অফিস",
        misconduct_type="delay", official_ref="REF-123",
        description="নির্ধারিত সময় পেরিয়ে গেলেও আবেদনটি প্রক্রিয়াধীন আছে।", language="bn",
    )
    draft = generate(request)
    assert "2026-10-02" in draft["body"]
    assert "ঢাকা আঞ্চলিক পাসপোর্ট অফিস" in draft["body"]
    assert "REF-123" in draft["body"]
    assert "নির্ধারিত সময় পেরিয়ে গেলেও আবেদনটি প্রক্রিয়াধীন আছে।" in draft["body"]
    assert draft["body"].count("2026-10-02") == 1
    assert "নাম: ____________________" in draft["body"]
    assert "মোবাইল নম্বর: ____________________" in draft["body"]
    assert draft["portal_url"] == PORTAL_URL


def test_english_complaint_uses_date_location_and_omits_blank_reference():
    request = GRSDraftRequest(
        incident_date="15 Oct 2026", location="Passport office, Dhaka",
        misconduct_type="document_refusal", description="The application was not accepted.", language="en",
    )
    draft = generate(request)
    assert "15 Oct 2026" in draft["body"]
    assert "Passport office, Dhaka" in draft["body"]
    assert "Reference:" not in draft["body"]
    assert "Name: ____________________" in draft["body"]
