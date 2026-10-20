"""Shared multilingual embedding provider used by backend RAG.

PLANNER §4 requires a MULTILINGUAL embedding model (Bangla content).
Models are downloaded on first index/query and cached by sentence-transformers.
The module does not implement or claim local-language-model generation.
"""
import logging
from typing import List, Optional

import numpy as np

from ..config import settings

logger = logging.getLogger(__name__)


class LocalEmbedder:
    """Singleton sentence-embedding provider with graceful fallback."""

    _instance = None
    _model = None
    _dim = 0

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_name: Optional[str] = None):
        if self._initialized and (not model_name or model_name == self.model_name):
            return
        self._initialized = True
        self.model_name = model_name or settings.EMBEDDING_MODEL
        self.device = settings.EMBEDDING_DEVICE
        self._model = self._load_with_fallbacks()

    # -- loading ---------------------------------------------------------
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
                dim = model.get_sentence_embedding_dimension()
                logger.info(f"Embedder ready: {name} dim={dim}")
                self.model_name = name
                self._dim = dim
                return model
            except Exception as e:  # noqa: BLE001 — try next fallback
                last_err = e
                logger.warning(f"Could not load {name}: {e}")
        raise RuntimeError(f"No embedding model could be loaded: {last_err}")

    # -- API --------------------------------------------------------------
    def embed(self, texts: List[str], batch_size: Optional[int] = None, task: str = "passage") -> np.ndarray:
        prefix = "query: " if task == "query" and "e5" in self.model_name.lower() else "passage: " if "e5" in self.model_name.lower() else ""
        inputs = [prefix + text for text in texts]
        out = self._model.encode(
            inputs,
            batch_size=batch_size or settings.EMBEDDING_BATCH_SIZE,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=settings.EMBEDDING_NORMALIZE,
        )
        return np.asarray(out, dtype=np.float32)

    def embed_single(self, text: str) -> np.ndarray:
        return self.embed([text], task="query")[0]

    def embed_query(self, text: str) -> np.ndarray:
        return self.embed([text], task="query")[0]

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
        if cls._instance is None or (model_name and cls._instance.model_name != model_name):
            cls._instance = cls(model_name=model_name)
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None
        cls._model = None
