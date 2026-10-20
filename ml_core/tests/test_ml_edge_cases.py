# ML Core edge-case locks (additive — backend API tests untouched).
import pytest

from ml_core.ml.corpus import _chunks
from ml_core.ml.utils.cache import LRUCache
from ml_core.ml.utils.metrics import compute_mrr, compute_recall_at_k


def test_chunks_long_paragraph_always_terminates():
    text = "x" * 5000
    out = _chunks(text, max_chars=1200, overlap=2000)
    assert out
    assert all(len(c) <= 1200 for c in out)
    assert "".join(out).replace("\n", "")[:5000] == text


def test_recall_and_mrr_empty_inputs():
    assert compute_recall_at_k([], [], k=5) == 1.0
    assert compute_recall_at_k(["a"], ["a"], k=0) == 0.0
    assert compute_mrr([], ["a"]) == 0.0


def test_lru_cache_evicts_oldest():
    cache = LRUCache[str, int](maxsize=2)
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("c", 3)
    assert cache.get("a") is None
    assert cache.get("b") == 2
