"""Service-data and fee-schedule ingestion for grounded retrieval."""
from app.rag import ingest


def test_service_data_chunks_are_citable_and_cover_all_enabled_services():
    docs = ingest.load_service_documents()
    assert docs
    service_ids = {item["metadata"]["service_id"] for item in docs}
    assert service_ids == {
        "epassport", "birth_registration", "nid", "driving_licence", "death_registration", "land_mutation",
    }
    for item in docs:
        metadata = item["metadata"]
        assert metadata["source_url"].startswith("https://")
        assert metadata["last_verified"]
        assert metadata["section"] in {"overview", "documents", "process", "warnings"}
        assert item["text"].strip()


def test_child_passport_documents_are_retrievable_from_service_data():
    docs = ingest.load_service_documents()
    minor = [
        item["text"] for item in docs
        if item["metadata"]["service_id"] == "epassport"
        and "child" in item["metadata"]["title"].lower()
        and item["metadata"]["section"] == "documents"
    ]
    text = "\n".join(minor)
    assert "Birth Registration Certificate" in text
    assert "NID" in text


def test_verified_fee_rules_become_fee_chunks_with_exact_totals():
    docs = ingest.load_fee_documents()
    assert docs
    text = "\n".join(item["text"] for item in docs)
    assert "4025 BDT" in text
    assert "8050 BDT" in text
    assert "2185 BDT" in text
    for item in docs:
        assert item["metadata"]["section"] == "fees"
        assert item["metadata"]["source_url"].startswith("https://")


def test_all_documents_include_every_retrieval_section():
    docs = ingest.load_all_documents()
    sections = {item["metadata"]["section"] for item in docs}
    assert {"overview", "documents", "process", "warnings", "fees"} <= sections


def test_payment_channels_get_their_own_focused_corpus_chunk():
    docs = ingest.load_corpus()
    matches = [item for item in docs if "a-challan" in item["text"].casefold()]
    assert matches
    text = "\n".join(item["text"] for item in matches)
    assert "DGePay" in text
    assert "ShurjoPay" in text
    # The payment paragraph must not drag the whole fee table into one chunk.
    assert "4025" not in text


def test_adult_photo_absence_is_explicit_and_child_photo_is_retained():
    docs = ingest.load_service_documents()
    adult = "\n".join(
        item["text"] for item in docs
        if item["metadata"]["service_id"] == "epassport"
        and "first application (adult) documents" in item["metadata"]["title"].lower()
    )
    assert "does not include a separate paper photograph" in adult
    assert "biometric" in adult

    child = "\n".join(
        item["text"] for item in docs
        if item["metadata"]["service_id"] == "epassport"
        and "child application documents" in item["metadata"]["title"].lower()
    )
    assert "does not include a separate paper photograph" not in child
    assert "3R-size photograph" in child

