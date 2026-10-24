"""Deterministic e-Passport photo-requirement answers.

Photo questions are easy to misread: the only paper photo in the verified
e-Passport data is the 3R photo for a child under six, while adults attend
biometric enrolment. A short question such as "adult paper photo needed?" used
to produce an unnecessary fallback, so this module answers it directly from the
service data.
"""
from __future__ import annotations

from typing import Any

from ..services import loader


def _is_photo_question(question: str) -> bool:
    value = question.casefold()
    return any(term in value for term in ("photo", "photograph", "ছবি", "ফটো"))


def _age_group(question: str) -> str:
    value = question.casefold()
    if any(term in value for term in ("child", "minor", "under six", "under-6", "under 6", "শিশু", "ছয়")):
        return "child"
    if any(term in value for term in ("adult", "18", "প্রাপ্তবয়স্ক")):
        return "adult"
    return "any"


def _citation(service: dict[str, Any], child_photo: dict[str, Any], quote: str) -> dict[str, str]:
    return {
        "title": f"{service['service_name_en']} — photo requirements",
        "url": child_photo.get("source_url", service["source_url"]),
        "last_verified": child_photo.get("last_verified", service["last_verified"]),
        "quote_snippet": quote[:300],
    }


def answer(question: str, service_id: str | None = None, language: str = "bn") -> dict[str, Any] | None:
    value = question.casefold()
    if service_id is None and any(term in value for term in ("passport", "পাসপোর্ট", "epassport")):
        service_id = "epassport"
    if service_id != "epassport" or not _is_photo_question(question):
        return None

    service = loader.get_service("epassport")
    tasks = {task["id"]: task for task in service.get("tasks", [])}
    documents = {document["id"]: document for document in service.get("documents", [])}
    adult = tasks.get("first_time_adult")
    child_photo = documents.get("child_photo")
    if not adult or not child_photo:
        return None

    adult_documents = [
        documents[reference["id"]]
        for reference in adult.get("documents", [])
        if reference["id"] in documents
    ]
    adult_has_photo = any(
        "photo" in (document["id"] + " " + document["label_en"]).casefold()
        and "photocopy" not in document["label_en"].casefold()
        for document in adult_documents
    )
    biometric_en = next(
        (step for step in adult.get("steps_en", []) if "biometric" in step.casefold()), ""
    )
    biometric_bn = next(
        (step for step in adult.get("steps_bn", []) if "বায়োমেট্রিক" in step), ""
    )
    group = _age_group(question)
    is_bn = language == "bn"

    if group == "child":
        answer_text = (
            f"ছয় বছরের কম শিশুর জন্য 3R সাইজের, গ্রে ব্যাকগ্রাউন্ডের ল্যাব-প্রিন্ট ছবি প্রয়োজন। "
            f"{biometric_bn or 'পাসপোর্ট অফিসে বায়োমেট্রিক এনরোলমেন্ট হয়।'}"
            if is_bn else
            f"For a child under six, a 3R-size lab-printed photograph with a grey background is required. "
            f"{biometric_en or 'The process includes biometric enrolment at the passport office.'}"
        )
    elif group == "adult":
        if adult_has_photo:
            labels = ", ".join(
                document["label_en"] for document in adult_documents
                if "photo" in (document["id"] + " " + document["label_en"]).casefold()
                and "photocopy" not in document["label_en"].casefold()
            )
            answer_text = (
                f"প্রাপ্তবয়স্ক আবেদনের নথির তালিকায় ছবি: {labels}। {biometric_bn}"
                if is_bn else
                f"The adult application checklist lists this photo document: {labels}. {biometric_en}"
            )
        else:
            answer_text = (
                "প্রাপ্তবয়স্কদের প্রথম আবেদনের নথির তালিকায় আলাদা কাগজের ছবি নেই; "
                f"পাসপোর্ট অফিসে বায়োমেট্রিক এনরোলমেন্টের সময় ছবি নেওয়া হয়। "
                "ছয় বছরের কম শিশুর জন্য অবশ্য 3R সাইজের ল্যাব-প্রিন্ট ছবি প্রয়োজন।"
                if is_bn else
                "For an adult first application, the official document checklist does not list a "
                "separate paper photograph; the process includes biometric enrolment at the passport "
                "office. A child under six does need a 3R-size lab-printed photograph."
            )
    else:
        answer_text = (
            "প্রাপ্তবয়স্কদের প্রথম আবেদনের নথির তালিকায় আলাদা কাগজের ছবি নেই; বায়োমেট্রিক "
            "এনরোলমেন্টের সময় ছবি নেওয়া হয়। ছয় বছরের কম শিশুর জন্য 3R সাইজের ল্যাব-প্রিন্ট ছবি প্রয়োজন।"
            if is_bn else
            "The adult first-application checklist does not list a separate paper photograph; the photo "
            "is captured at biometric enrolment. A child under six does need a 3R-size lab-printed photograph."
        )

    quote = f"Child photo: {child_photo['notes_en']} Adult process: {biometric_en}"
    return {
        "answer": answer_text,
        "citations": [_citation(service, child_photo, quote)],
        "grounded": True,
        "retrieved_chunks": [],
        "generation_mode": "deterministic",
        "llm_provider": "none",
        "llm_model": None,
    }
