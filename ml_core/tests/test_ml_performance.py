"""Performance and correctness locks for the shared ML core.

These tests use tiny fake encoders, so they do not download a model and do not
need PyTorch, ONNX or Chroma.
"""
from __future__ import annotations

import threading

import numpy as np

from ml_core.ml.classifiers.intent_classifier import IntentClassifier
from ml_core.ml.embeddings.embedder import LocalEmbedder
from ml_core.ml.pipeline.rag_pipeline import RAGPipeline
from ml_core.ml.utils.cache import LRUCache


class _FakeModel:
    def __init__(self):
        self.calls: list[list[str]] = []
        self.max_seq_length = 512

    def get_sentence_embedding_dimension(self) -> int:
        return 4

    def eval(self):
        return self

    def encode(self, inputs, **kwargs):
        self.calls.append(list(inputs))
        rows = []
        for text in inputs:
            seed = float(sum(ord(char) for char in text))
            rows.append([seed + offset for offset in range(4)])
        return np.asarray(rows, dtype=np.float32)


def _bare_embedder(model: _FakeModel) -> LocalEmbedder:
    embedder = object.__new__(LocalEmbedder)
    embedder.model_name = "intfloat/multilingual-e5-small"
    embedder.device = "cpu"
    embedder._model = model
    embedder._dim = 4
    embedder._initialized = True
    embedder._query_cache = LRUCache(maxsize=8)
    embedder._cache_lock = threading.Lock()
    return embedder


def test_query_cache_avoids_second_encode_and_stores_only_digests():
    model = _FakeModel()
    embedder = _bare_embedder(model)

    first = embedder.embed_query("passport fee")
    second = embedder.embed_query("passport fee")

    assert model.calls == [["query: passport fee"]]
    assert np.array_equal(first, second)
    assert embedder.cache_info()["hits"] == 1
    # A question must never be retained as plain text in the cache.
    assert all(len(key) == 64 for key in embedder._query_cache._data)
    assert all("passport" not in key for key in embedder._query_cache._data)


def test_e5_prefix_is_not_applied_twice():
    model = _FakeModel()
    embedder = _bare_embedder(model)

    embedder.embed(["query: already prefixed"], task="query")
    embedder.embed_documents(["passage: also prefixed"])

    assert model.calls == [
        ["query: already prefixed"],
        ["passage: also prefixed"],
    ]


def test_batch_deduplicates_and_maps_results_back():
    model = _FakeModel()
    embedder = _bare_embedder(model)

    vectors = embedder.embed_documents(["same", "same", "different"])

    assert model.calls == [["passage: same", "passage: different"]]
    assert vectors.shape == (3, 4)
    assert np.array_equal(vectors[0], vectors[1])
    assert not np.array_equal(vectors[0], vectors[2])


def test_empty_batch_keeps_embedding_dimension():
    embedder = _bare_embedder(_FakeModel())

    vectors = embedder.embed_documents([])

    assert vectors.shape == (0, 4)
    assert vectors.dtype == np.float32


def test_query_cache_can_be_bypassed_for_sensitive_text():
    model = _FakeModel()
    embedder = _bare_embedder(model)

    embedder.embed_query("NID 1234567890", use_cache=False)
    embedder.embed_query("NID 1234567890", use_cache=False)

    assert len(model.calls) == 2
    assert embedder.cache_info()["size"] == 0


def test_get_instance_accepts_a_model_name(monkeypatch):
    monkeypatch.setattr(LocalEmbedder, "_load_with_fallbacks", lambda self: _FakeModel())
    monkeypatch.setattr(
        LocalEmbedder, "_embedding_dimension", staticmethod(lambda model: 4)
    )
    LocalEmbedder.reset()
    try:
        instance = LocalEmbedder.get_instance("intfloat/multilingual-e5-small")
        assert instance.get_model_name() == "intfloat/multilingual-e5-small"
        assert instance.dim == 4
    finally:
        LocalEmbedder.reset()


def _one_hot(text: str) -> np.ndarray:
    lowered = text.lower()
    groups = [
        ("fee", "ফি", "টাকা", "cost", "price"),
        ("document", "কাগজ", "নথি"),
        ("payment", "pay", "পরিশোধ", "চালান"),
        ("step", "process", "ধাপ", "প্রক্রিয়া", "renew"),
        ("complaint", "grs", "অভিযোগ"),
    ]
    for index, terms in enumerate(groups):
        if any(term in lowered for term in terms):
            vector = np.zeros(5, dtype=np.float32)
            vector[index] = 1.0
            return vector
    return np.zeros(5, dtype=np.float32)


class _ClassifierEmbedder:
    def __init__(self):
        self.passage_batches: list[list[str]] = []

    def embed_documents(self, texts):
        self.passage_batches.append(list(texts))
        return np.vstack([_one_hot(text) for text in texts])

    def embed_query(self, text):
        return _one_hot(text)


def test_intent_classifier_uses_passage_prototypes_and_returns_score():
    embedder = _ClassifierEmbedder()
    classifier = IntentClassifier(embedder=embedder)

    section, score = classifier.predict_with_score("What is the passport fee?")

    assert section == "fees"
    assert score > 0.9
    assert len(embedder.passage_batches) == 1  # prototypes are passage text


class _CountingClassifier(IntentClassifier):
    def __init__(self):
        self.calls = 0

    def predict(self, text, section=None):  # noqa: D401 - test double
        self.calls += 1
        return "fees"


class _CountingEmbedder:
    def __init__(self):
        self.query_calls = 0

    def embed_single(self, text):
        self.query_calls += 1
        return np.ones(4, dtype=np.float32)


class _EmptyStore:
    def query(self, embedding, n=5):
        return []


def test_pipeline_classifies_the_question_once():
    classifier = _CountingClassifier()
    embedder = _CountingEmbedder()
    pipeline = RAGPipeline(
        embedder=embedder,
        chroma_store=_EmptyStore(),
        intent_classifier=classifier,
    )

    pipeline.query("passport fee", top_k=5)

    assert classifier.calls == 1
    assert embedder.query_calls == 1


class _CapturingStore:
    def __init__(self):
        self.requested = None

    def query(self, embedding, n=5):
        self.requested = n
        return []


class _Reranker:
    def predict(self, pairs):
        return [0.5 for _ in pairs]


def test_pipeline_fetches_wider_candidates_when_reranking():
    store = _CapturingStore()
    pipeline = RAGPipeline(
        embedder=_CountingEmbedder(),
        chroma_store=store,
        intent_classifier=_CountingClassifier(),
    )
    pipeline._reranker = _Reranker()

    pipeline.search("passport fee", top_k=5, section="fees")

    assert store.requested == 20
