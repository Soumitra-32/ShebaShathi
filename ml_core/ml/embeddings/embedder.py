"""Shared multilingual embedding provider used by backend RAG.

PLANNER §4 requires a MULTILINGUAL embedding model (Bangla content).
Models are downloaded on first index/query and cached by sentence-transformers.
The module does not implement or claim local-language-model generation.

Two small runtime optimisations are deliberately kept here so every caller of
the shared provider gets them:

* query embeddings are memoised in a bounded LRU cache keyed by a SHA-256
  digest (never by the raw question), and
* duplicate strings in one batch are encoded once and mapped back.

Neither optimisation changes the model, the E5 prefixes, or any answer text.
"""
import hashlib
import logging
import threading
from typing import List, Optional

import numpy as np

from ..config import settings
from ..utils.cache import LRUCache

logger = logging.getLogger(__name__)

E5_QUERY_PREFIX = "query: "
E5_PASSAGE_PREFIX = "passage: "


class LocalEmbedder:
    """Singleton sentence-embedding provider with graceful fallback."""

    _instance = None
    _instance_lock = threading.RLock()
    _model = None
    _dim = 0

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._initialized = False
                    cls._instance = instance
        return cls._instance

    def __init__(self, model_name: Optional[str] = None):
        with self._instance_lock:
            if self._initialized and (not model_name or model_name == self.model_name):
                return
            resolved = model_name or settings.EMBEDDING_MODEL
            if self._initialized and self.model_name == resolved and self._model is not None:
                return

            # A model switch must not leave the old model or cache attached.
            if self._initialized and self.model_name != resolved:
                self._initialized = False
                self._model = None

            self.model_name = resolved
            self.device = settings.EMBEDDING_DEVICE
            try:
                self._model = self._load_with_fallbacks()
                self._dim = self._embedding_dimension(self._model)
                self._query_cache = LRUCache(maxsize=max(1, int(settings.EMBEDDING_CACHE_SIZE)))
                self._cache_lock = threading.Lock()
                self._initialized = True
            except Exception:
                self._initialized = False
                self._model = None
                raise

    # -- loading ---------------------------------------------------------
    @staticmethod
    def _embedding_dimension(model) -> int:
        getter = getattr(model, "get_embedding_dimension", None)
        if getter is None:
            getter = model.get_sentence_embedding_dimension
        return int(getter())

    def _load_with_fallbacks(self):
        from sentence_transformers import SentenceTransformer

        candidates = [self.model_name] + [name for name in settings.EMBEDDING_FALLBACKS if name != self.model_name]
        last_err = None
        for name in candidates:
            try:
                logger.info(f"Loading embedding model: {name} ({self.device})")
                model = SentenceTransformer(
                    name, device=self.device,
                    trust_remote_code=True,
                )
                if hasattr(model, "max_seq_length"):
                    model.max_seq_length = settings.EMBEDDING_MAX_LENGTH
                if hasattr(model, "eval"):
                    model.eval()
                dim = self._embedding_dimension(model)
                logger.info(f"Embedder ready: {name} dim={dim}")
                self.model_name = name
                self._dim = dim
                return model
            except Exception as e:  # noqa: BLE001 — try next fallback
                last_err = e
                logger.warning(f"Could not load {name}: {e}")
        raise RuntimeError(f"No embedding model could be loaded: {last_err}")

    # -- API --------------------------------------------------------------
    def embed(self, texts: List[str], batch_size: Optional[int] = None, task: str = "passage",
              use_cache: bool = True) -> np.ndarray:
        if texts is None:
            texts = []
        if isinstance(texts, str):
            texts = [texts]
        prepared_texts = ["" if text is None else str(text) for text in texts]
        if not prepared_texts:
            return np.zeros((0, self.dim), dtype=np.float32)

        prefix = self._prefix_for(task)
        prepared = [self._apply_prefix(text, prefix) for text in prepared_texts]

        # Repeated strings in one request (for example a bilingual checklist
        # with the same label twice) should cost one encoder pass, not two.
        unique = list(dict.fromkeys(prepared))
        cache_key = None
        if use_cache and task == "query" and len(unique) == 1:
            cache_key = self._cache_key(unique[0])
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached.reshape(1, -1).copy()

        vectors = self._encode(unique, batch_size=batch_size)
        if cache_key is not None:
            self._cache_put(cache_key, vectors[0].copy())

        if len(unique) == len(prepared):
            return vectors

        position = {text: index for index, text in enumerate(unique)}
        return vectors[[position[text] for text in prepared]]

    def _encode(self, inputs: List[str], batch_size: Optional[int] = None) -> np.ndarray:
        model = self._model
        if model is None:
            raise RuntimeError("Embedding model is not loaded")
        out = model.encode(
            inputs,
            batch_size=batch_size or settings.EMBEDDING_BATCH_SIZE,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=settings.EMBEDDING_NORMALIZE,
        )
        array = np.asarray(out, dtype=np.float32)
        if array.ndim == 1:
            array = array.reshape(1, -1)
        return array

    def _prefix_for(self, task: str) -> str:
        if "e5" not in (self.model_name or "").lower():
            return ""
        return E5_QUERY_PREFIX if task == "query" else E5_PASSAGE_PREFIX

    @staticmethod
    def _apply_prefix(text: str, prefix: str) -> str:
        if not prefix:
            return text
        # The ONNX/eval scripts sometimes pass already-prefixed strings. Adding
        # another prefix would silently change the embedding, so leave a valid
        # E5 prefix untouched.
        if text.startswith(E5_QUERY_PREFIX) or text.startswith(E5_PASSAGE_PREFIX):
            return text
        return prefix + text

    # -- query cache ------------------------------------------------------
    def _cache_key(self, prepared_text: str) -> str:
        # Hash the raw input; the cache never stores user questions as text.
        payload = f"{self.model_name}\0{prepared_text}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _cache_get(self, key: str) -> Optional[np.ndarray]:
        cache = getattr(self, "_query_cache", None)
        lock = getattr(self, "_cache_lock", None)
        if cache is None or lock is None:
            return None
        with lock:
            return cache.get(key)

    def _cache_put(self, key: str, vector: np.ndarray) -> None:
        cache = getattr(self, "_query_cache", None)
        lock = getattr(self, "_cache_lock", None)
        if cache is None or lock is None:
            return
        with lock:
            cache.put(key, vector)

    def clear_cache(self) -> None:
        """Drop cached query vectors (for example after a model switch)."""
        cache = getattr(self, "_query_cache", None)
        lock = getattr(self, "_cache_lock", None)
        if cache is None or lock is None:
            return
        with lock:
            cache.clear()

    def cache_info(self) -> dict:
        """Return cache counters without exposing any cached key or text."""
        cache = getattr(self, "_query_cache", None)
        lock = getattr(self, "_cache_lock", None)
        if cache is None:
            return {"size": 0, "maxsize": 0, "hits": 0, "misses": 0}
        if lock is not None:
            with lock:
                return {
                    "size": len(cache),
                    "maxsize": cache.maxsize,
                    "hits": cache.hits,
                    "misses": cache.misses,
                }
        return {
            "size": len(cache),
            "maxsize": cache.maxsize,
            "hits": cache.hits,
            "misses": cache.misses,
        }

    # -- convenience wrappers --------------------------------------------
    def embed_single(self, text: str, use_cache: bool = True) -> np.ndarray:
        return self.embed_query(text, use_cache=use_cache)

    def embed_query(self, text: str, use_cache: bool = True) -> np.ndarray:
        return self.embed([text], task="query", use_cache=use_cache)[0]

    def embed_documents(self, texts: List[str]) -> np.ndarray:
        return self.embed(texts, task="passage")

    @property
    def dim(self) -> int:
        return self._dim or settings.EMBEDDING_DIM

    def get_model_name(self) -> str:
        return self.model_name

    def is_ready(self) -> bool:
        return self._model is not None

    @classmethod
    def get_instance(cls, model_name: Optional[str] = None) -> "LocalEmbedder":
        with cls._instance_lock:
            if cls._instance is None or (model_name and cls._instance.model_name != model_name):
                cls._instance = cls(model_name=model_name)
            return cls._instance

    @classmethod
    def reset(cls) -> None:
        with cls._instance_lock:
            if cls._instance is not None:
                cls._instance.clear_cache()
            cls._instance = None
            cls._model = None
