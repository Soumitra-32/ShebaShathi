"""
ML Core Configuration — single source of truth for all local ML settings.

Shared multilingual embedding settings used by the backend RAG pipeline.
The model must be local or downloaded on first index/query. Generation is a
separate optional API adapter; this package does not provide a local LLM.
"""
import os
from functools import lru_cache
from typing import List

try:
    from pydantic_settings import BaseSettings
    from pydantic import Field
    _HAS_PYDANTIC_SETTINGS = True
except ImportError:  # graceful fallback if pydantic-settings missing
    _HAS_PYDANTIC_SETTINGS = False


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).lower() in ("1", "true", "yes", "y")


# ---------------------------------------------------------------------------
# Plain-dataclass settings (works with or without pydantic-settings)
# ---------------------------------------------------------------------------
class MLSettings:
    """All ML knobs in one place. Override via ML_* environment variables."""

    # --- Embedding model (multilingual REQUIRED — Bangla content) -----------
    EMBEDDING_MODEL: str = _env("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    EMBEDDING_FALLBACKS: List[str] = ["BAAI/bge-m3"]
    EMBEDDING_DIM: int = _env_int("ML_EMBEDDING_DIM", 384)
    EMBEDDING_MAX_LENGTH: int = _env_int("ML_EMBEDDING_MAXLEN", 512)
    EMBEDDING_BATCH_SIZE: int = _env_int("ML_EMBEDDING_BATCH", 16)
    EMBEDDING_DEVICE: str = _env("ML_EMBEDDING_DEVICE", "cpu")
    EMBEDDING_NORMALIZE: bool = _env_bool("ML_EMBEDDING_NORMALIZE", True)

    # This package only supplies embeddings; generation and vector storage live
    # in the backend RAG implementation.

    # --- Retrieval / rerank defaults (additive; backend keeps its own values) --
    RAG_TOP_K: int = _env_int("ML_RAG_TOP_K", 5)
    RAG_MIN_SCORE: float = _env_float("ML_RAG_MIN_SCORE", 0.35)
    RAG_SECTION_FILTER: bool = _env_bool("ML_RAG_SECTION_FILTER", True)
    RAG_RERANKER_MODEL: str = _env("ML_RAG_RERANKER_MODEL", "")
    RAG_RERANK_TOP_N: int = _env_int("ML_RAG_RERANK_TOP_N", 3)
    RAG_OVERLAP_CHARS: int = _env_int("ML_RAG_OVERLAP_CHARS", 180)
    RAG_MAX_CHARS: int = _env_int("ML_RAG_MAX_CHARS", 1200)

    # --- Vector store identity ---------------------------------------------
    CHROMA_COLLECTION: str = _env("ML_CHROMA_COLLECTION", "epassport")
    CHROMA_COSINE_SPACE: bool = _env_bool("ML_CHROMA_COSINE_SPACE", True)

    # --- Eval defaults ------------------------------------------------------
    EVAL_MIN_SECTION_ACCURACY: float = _env_float("ML_EVAL_MIN_SECTION_ACC", 0.6)
    EVAL_MIN_RETRIEVAL_RECALL: float = _env_float("ML_EVAL_MIN_RETRIEVAL_RECALL", 0.6)


@lru_cache()
def get_ml_settings() -> MLSettings:
    return MLSettings()


settings = get_ml_settings()
