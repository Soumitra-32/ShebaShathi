from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_fee_and_minor_checklist_api_contracts():
    fee = client.post("/api/fees/calculate", json={"pages": 48, "validity_years": 5, "delivery": "regular"})
    assert fee.status_code == 200
    assert fee.json()["total"] == 4025
    assert fee.json()["last_verified"] == "2026-10-15"

    checklist = client.post("/api/checklist", json={"profile": {
        "applicant_type": "minor", "age": 5, "pages": 48, "validity_years": 5, "language": "bn",
    }})
    assert checklist.status_code == 200
    assert checklist.json()["payment_source_url"].startswith("https://")
    photo = next(item for item in checklist.json()["documents"] if item["id"] == "child_photo")
    assert photo["required"] is True


def test_redflag_api_uses_fee_engine_and_includes_source_date():
    response = client.post("/api/redflag/check", json={
        "claimed_amount": 7000, "pages": 48, "validity_years": 10, "delivery": "regular",
    })
    assert response.status_code == 200
    assert response.json()["official_total"] == 5750
    assert response.json()["flag"] is True
    assert response.json()["source_url"].endswith("/instructions/passport-fees")


def test_grs_api_includes_incident_date_and_official_portal():
    response = client.post("/api/grs/draft", json={
        "incident_date": "2026-10-02", "location": "Dhaka passport office",
        "misconduct_type": "delay", "description": "The application is delayed.", "language": "en",
    })
    assert response.status_code == 200
    assert response.json()["body"].count("2026-10-02") == 1
    assert response.json()["portal_url"] == "https://www.grs.gov.bd/complainWithoutLogin.do"


def test_copilot_api_returns_flat_verified_citation(monkeypatch):
    from app.rag import generator, retriever

    chunk = {
        "id": "source-chunk", "text": "Express fee is 6325 taka.", "score": 0.91,
        "metadata": {"section": "fees", "title": "Official fees",
                     "source_url": "https://www.epassport.gov.bd/instructions/passport-fees",
                     "last_verified": "2026-10-15"},
    }
    monkeypatch.setattr(retriever, "retrieve", lambda *args, **kwargs: [chunk])
    monkeypatch.setattr(generator, "generate", lambda *args, **kwargs: {
        "answer": chunk["text"], "used_chunk_ids": [chunk["id"]],
        "retrieved_chunks": [chunk], "generation_mode": "extractive",
    })
    response = client.post("/api/copilot/ask", json={"question": "What is the express fee?", "language": "en"})
    assert response.status_code == 200
    result = response.json()
    assert result["grounded"] is True
    assert result["retrieved_chunks"][0]["id"] == "source-chunk"
    assert result["citations"][0]["url"] == chunk["metadata"]["source_url"]
