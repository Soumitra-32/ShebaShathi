"""Tests for the numpy vector store (the low-memory serving path)."""
from pathlib import Path

import numpy as np
import pytest

from app.rag import retriever
from app.rag import vector_store


def _make_store(tmp_path: Path) -> vector_store.NumpyStore:
    # Two unit vectors: "fee" axis and "birth" axis.
    embeddings = np.array([
        [1.0, 0.0],
        [0.0, 1.0],
        [np.sqrt(0.5), np.sqrt(0.5)],
    ], dtype=np.float32)
    np.savez_compressed(
        tmp_path / "index.npz",
        ids=np.array(["fee-chunk", "birth-chunk", "mixed-chunk"], dtype=np.str_),
        embeddings=embeddings,
    )
    chunks = [
        {"text": "fee is 4025", "metadata": {"service_id": "epassport", "section": "fees"}},
        {"text": "birth papers", "metadata": {"service_id": "birth_registration", "section": "documents"}},
        {"text": "mixed", "metadata": {"service_id": "epassport", "section": "documents"}},
    ]
    (tmp_path / "chunks.json").write_text(
        __import__("json").dumps(chunks), encoding="utf-8"
    )
    return vector_store.NumpyStore(tmp_path)


def test_query_orders_by_cosine_similarity(tmp_path):
    store = _make_store(tmp_path)
    result = store.query(
        query_embeddings=[[0.9, 0.1]],  # closest to the "fee" axis
        n_results=2,
    )
    assert result["ids"][0][0] == "fee-chunk"
    assert result["ids"][0][1] == "mixed-chunk"
    assert result["distances"][0][0] == pytest.approx(0.0, abs=0.02)
    # Query/response shape stays identical to a chroma collection.
    assert set(result) == {"ids", "documents", "metadatas", "distances"}


def test_where_filter_is_equality_based_and(tmp_path):
    store = _make_store(tmp_path)
    result = store.query(
        query_embeddings=[[1.0, 0.0]],
        n_results=5,
        where={"$and": [{"service_id": "epassport"}, {"section": "fees"}]},
    )
    assert result["ids"][0] == ["fee-chunk"]

    with pytest.raises(ValueError):
        store.query(
            query_embeddings=[[1.0, 0.0]], n_results=5, where={"service_id": {"$in": ["a", "b"]}}
        )


def test_stability_with_unnormalised_query(tmp_path):
    store = _make_store(tmp_path)
    big = store.query(query_embeddings=[[90.0, 10.0]], n_results=2)
    small = store.query(query_embeddings=[[0.9, 0.1]], n_results=2)
    assert big["ids"] == small["ids"]


def test_get_returns_matching_chunk(tmp_path):
    store = _make_store(tmp_path)
    result = store.get(ids=["birth-chunk", "missing-id"])
    assert result["ids"] == ["birth-chunk"]
    assert result["metadatas"][0]["service_id"] == "birth_registration"


def test_retriever_serves_from_numpy_store(tmp_path, monkeypatch):
    store = _make_store(tmp_path)
    monkeypatch.setattr(retriever.settings, "vector_store", "numpy")
    monkeypatch.setattr(retriever.settings, "chroma_persist_dir", str(tmp_path))
    monkeypatch.setattr(
        "app.rag.vector_store.NumpyStore",
        lambda *args, **kwargs: store,
    )
    retriever.reset_clients()
    try:
        assert retriever.collection_count() == store.count()
    finally:
        retriever.reset_clients()
