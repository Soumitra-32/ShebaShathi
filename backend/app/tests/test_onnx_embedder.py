"""Tests for the ONNX embedder (the low-memory production path).

These tests need the ONNX artefacts (backend/models/e5-small-onnx/, fetch with
``python backend/scripts/fetch_onnx_model.py``). Without them they are skipped
so the suite still runs on a clean checkout.
"""
from pathlib import Path

import numpy as np
import pytest

from app.config import settings
from app.rag import retriever
from app.rag.onnx_embedder import OnnxEmbedder

MODEL_DIR = Path(settings.onnx_model_dir)
model_available = pytest.mark.skipif(
    not (MODEL_DIR / "model.onnx").exists() or not (MODEL_DIR / "tokenizer.json").exists(),
    reason="ONNX e5-small artefacts not fetched (run backend/scripts/fetch_onnx_model.py)",
)


@pytest.fixture(scope="module")
def embedder():
    return OnnxEmbedder.get_instance()


@model_available
def test_embedder_returns_384_dim_unit_vectors(embedder):
    vector = embedder.embed_query("পাসপোর্ট নবায়ন ফি কত")
    assert vector.shape == (384,)
    assert abs(np.linalg.norm(vector) - 1.0) < 1e-5


@model_available
def test_embedder_is_deterministic(embedder):
    first = embedder.embed_query("birth registration correction fee")
    second = embedder.embed_query("birth registration correction fee")
    assert np.array_equal(first, second)


@model_available
def test_batch_embed_documents_shapes_and_normalisation(embedder):
    docs = embedder.embed_documents([
        "The e-Passport application includes a biometric enrolment step.",
        "জন্ম নিবন্ধন সংশোধনের জন্য অনলাইন আবেদন করতে হয়।",
        "",  # empty text must not break the batch
    ])
    assert docs.shape == (3, 384)
    assert np.allclose(np.linalg.norm(docs, axis=1), 1.0, atol=1e-5)


@model_available
def test_query_and_passage_prefixes_differ(embedder):
    text = "passport renewal fee"
    as_query = embedder.embed_query(text)
    as_passage = embedder.embed_documents([text])[0]
    similarity = float(np.dot(as_query, as_passage))
    assert similarity < 0.999999, "query/passage prefixes must be applied"
    assert similarity > 0.5, "same text with different prefixes stays close"


@model_available
def test_retriever_uses_onnx_backend_when_configured(monkeypatch):
    monkeypatch.setattr(retriever.settings, "embedding_backend", "onnx")
    retriever._embedder.cache_clear()
    try:
        instance = retriever._embedder()
        assert isinstance(instance, OnnxEmbedder)
    finally:
        retriever._embedder.cache_clear()
        OnnxEmbedder.reset()


@model_available
def test_bangla_and_english_same_meaning_stay_close(embedder):
    en = embedder.embed_query("How much is the online passport application fee?")
    bn = embedder.embed_query("অনলাইন পাসপোর্ট আবেদনের ফি কত?")
    assert float(np.dot(en, bn)) > 0.75
