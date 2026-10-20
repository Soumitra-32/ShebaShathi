"""Generate source-bounded applicant checklists from requirements.json."""
import json
from pathlib import Path

REQUIREMENTS_FILE = Path(__file__).resolve().parents[3] / "data" / "requirements.json"
with REQUIREMENTS_FILE.open(encoding="utf-8") as source:
    REQUIREMENTS = json.load(source)
DOCUMENTS = {item["id"]: item for item in REQUIREMENTS["documents"]}


def generate(profile):
    scenario = next((item for item in REQUIREMENTS["scenarios"] if item["id"] == profile.applicant_type), None)
    if scenario is None:
        raise ValueError("Unsupported application scenario")
    language = profile.language
    ids = scenario["required_documents"] + scenario["optional_documents"]
    required_ids = set(scenario["required_documents"])
    if profile.applicant_type == "minor" and not profile.has_nid:
        required_ids.add("parent_nid")
    documents = [{
        "id": item_id,
        "label_bn": DOCUMENTS[item_id]["label_bn"],
        "label_en": DOCUMENTS[item_id]["label_en"],
        "required": item_id in required_ids,
        "notes_bn": DOCUMENTS[item_id]["notes_bn"],
        "notes_en": DOCUMENTS[item_id]["notes_en"],
        "source_url": DOCUMENTS[item_id]["source_url"],
        "last_verified": DOCUMENTS[item_id]["last_verified"],
    } for item_id in ids]

    if profile.applicant_type == "minor" and profile.age is not None and profile.age < 6:
        for document in documents:
            if document["id"] == "child_photo":
                document["required"] = True

    if profile.applicant_type == "minor" and (profile.pages not in (None, 48) or profile.validity_years not in (None, 5)):
        raise ValueError("Applicants under 18 are limited to 48 pages and 5-year validity by official instructions.")

    if language == "bn":
        steps = [
            "সরকারি e-Passport পোর্টালে নতুন বা রি-ইস্যু আবেদন পূরণ করুন।",
            "ফি তালিকায় দেখানো মোট টাকা নির্ধারিত পেমেন্ট মাধ্যমে পরিশোধ করুন।",
            "বায়োমেট্রিক তথ্য দেওয়ার জন্য নির্ধারিত পাসপোর্ট অফিসে যান।",
            "আবেদন ও সংগ্রহ-সংক্রান্ত হালনাগাদ নির্দেশনা সরকারি পোর্টালে দেখুন।",
        ]
        channels = [item["label_bn"] for item in REQUIREMENTS["payment_channels"]]
        notice = REQUIREMENTS["checklist_notice_bn"]
        if profile.applicant_type == "minor":
            notice += " ১৮ বছরের কম বয়সীদের পাসপোর্টের মেয়াদ ৫ বছর এবং পৃষ্ঠা ৪৮টি।"
    else:
        steps = [
            "Complete a new or re-issue application on the official e-Passport portal.",
            "Pay the total shown in the fee schedule through a listed payment channel.",
            "Visit the assigned passport office for biometric enrolment.",
            "Check the official portal for current application and collection instructions.",
        ]
        channels = [item["label_en"] for item in REQUIREMENTS["payment_channels"]]
        notice = REQUIREMENTS["checklist_notice_en"]
    return {
        "documents": documents,
        "steps": steps,
        "payment_channels": channels,
        "warnings": [notice],
        "source_url": REQUIREMENTS["service_url"],
        "last_verified": REQUIREMENTS["last_verified"],
        "payment_source_url": REQUIREMENTS["payment_channels"][0]["source_url"],
        "payment_last_verified": REQUIREMENTS["payment_channels"][0]["last_verified"],
    }
