from app.rag import retriever, verifier


def _chunk(chunk_id="chunk-1", text="Express fee is 6325 taka."):
    return {"id": chunk_id, "text": text, "score": 0.9, "metadata": {
        "section": "fees", "source_url": "https://www.epassport.gov.bd/instructions/passport-fees",
        "last_verified": "2026-10-15", "title": "Official fee schedule",
    }}


class FakeCollection:
    def count(self):
        return 2

    def query(self, **kwargs):
        assert kwargs["where"] == {"section": "fees"}
        return {"ids": [["chunk-1", "chunk-2"]],
                "documents": [["Express fee is 6325 taka.", "Regular fee is 4025 taka."]],
                "metadatas": [[_chunk()["metadata"], _chunk("chunk-2")["metadata"]]],
                "distances": [[0.1, 0.7]]}


def test_retrieval_returns_chunk_ids_scores_and_applies_min_similarity(monkeypatch):
    monkeypatch.setattr(retriever, "_collection", lambda: FakeCollection())
    monkeypatch.setattr(retriever, "embed_query", lambda query: [0.1, 0.2])
    docs = retriever.retrieve("What is the express fee?", min_score=0.5)
    assert len(docs) == 1
    assert docs[0]["id"] == "chunk-1"
    assert docs[0]["score"] == 0.9
    assert docs[0]["metadata"]["source_url"].startswith("https://")


def test_retrieval_queries_a_real_persistent_chroma_collection(tmp_path, monkeypatch):
    import chromadb

    client = chromadb.PersistentClient(path=str(tmp_path / "chroma"))
    collection = client.create_collection("rag_test", metadata={"hnsw:space": "cosine"})
    collection.add(
        ids=["close-fee", "unrelated-fee"],
        documents=["Express delivery costs 6325 taka.", "Regular delivery takes 15 working days."],
        metadatas=[_chunk()["metadata"], _chunk("other")["metadata"]],
        embeddings=[[1.0, 0.0], [0.0, 1.0]],
    )
    monkeypatch.setattr(retriever, "_collection", lambda: collection)
    monkeypatch.setattr(retriever, "embed_query", lambda query: [1.0, 0.0])

    docs = retriever.retrieve("What is the fee?", top_k=2, min_score=0.5)

    assert [doc["id"] for doc in docs] == ["close-fee"]
    assert docs[0]["score"] == 1.0


def test_verifier_accepts_only_known_chunks_with_supported_numbers():
    answer = {"answer": "Express fee is 6325 taka.", "used_chunk_ids": ["chunk-1"], "retrieved_chunks": [_chunk()]}
    assert verifier.verify(answer)["grounded"] is True
    answer["answer"] = "Express fee is 9000 taka."
    result = verifier.verify(answer)
    assert result["grounded"] is False
    assert result["used_chunk_ids"] == []


def test_verifier_rejects_unknown_chunk_id_and_missing_metadata():
    answer = {"answer": "Fee is 6325 taka.", "used_chunk_ids": ["not-retrieved"], "retrieved_chunks": [_chunk()]}
    assert "unknown chunk id" in verifier.verify(answer)["issues"]
    chunk = _chunk()
    chunk["metadata"].pop("source_url")
    answer.update(used_chunk_ids=["chunk-1"], retrieved_chunks=[chunk])
    assert "missing verified source metadata" in verifier.verify(answer)["issues"]


def test_generation_without_documents_does_not_claim_grounding(monkeypatch):
    from app.rag import generator
    monkeypatch.setattr(generator.llm, "is_configured", lambda: False)
    answer = generator.generate("Unknown question", docs=[])
    assert answer["answer"] == ""
    assert answer["used_chunk_ids"] == []
    assert answer["generation_mode"] == "unavailable"


def test_verifier_rejects_url_not_present_in_cited_source():
    answer = {"answer": "Use https://fake.example/claim for details.", "used_chunk_ids": ["chunk-1"], "retrieved_chunks": [_chunk()]}
    result = verifier.verify(answer)
    assert result["grounded"] is False
    assert "unsupported URL" in result["issues"]
