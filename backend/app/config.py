"""
Configuration for ShebaShathi BD backend.
"""
import os
from functools import lru_cache
from typing import Optional
from pathlib import Path
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _resolve_path_env(name: str, default: Path) -> str:
    """Resolve a relative configured path against the repository, not the cwd.

    ``uvicorn --app-dir backend``, ``python -m app.rag.ingest`` and the live
    eval script otherwise resolve ``./.chroma`` or ``.state/...`` from different
    working directories. Production can still use an absolute path such as
    ``/app/.chroma`` or ``/tmp/shebashathi-rate-limits.db``.
    """
    raw = os.environ.get(name, str(default))
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return str(path)


def _resolve_persist_dir() -> str:
    return _resolve_path_env("CHROMA_PERSIST_DIR", PROJECT_ROOT / ".chroma")


def _resolve_rate_limit_db_path() -> str:
    return _resolve_path_env(
        "RATE_LIMIT_DB_PATH", PROJECT_ROOT / ".state" / "rate_limits.db"
    )


class Settings(BaseModel):
    # App
    app_name: str = "ShebaShathi BD API"
    app_version: str = "0.1.0"
    debug: bool = os.environ.get("DEBUG", "false").lower() == "true"

    # Server
    host: str = os.environ.get("HOST", "0.0.0.0")
    port: int = int(os.environ.get("PORT", "8000"))

    # Frontend / CORS
    cors_origins: list[str] = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]

    # Optional self‑hosted model path for local summarization (e.g., ggml .bin)
    llm_local_model_path: Optional[str] = None

    # OpenRouter: LLM_API_BASE=https://openrouter.ai/api/v1
    llm_model: str = os.environ.get("LLM_MODEL", "anthropic/claude-sonnet-4.6")
    llm_api_base: str = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1")
    llm_api_key: str = os.environ.get("LLM_API_KEY", "")
    # Optional OpenRouter attribution headers (shown in the provider dashboard).
    llm_app_title: str = os.environ.get("LLM_APP_TITLE", "")
    llm_http_referer: str = os.environ.get("LLM_HTTP_REFERER", "")

    # RAG
    chroma_persist_dir: str = _resolve_persist_dir()
    embedding_model: str = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    # ``torch`` uses ml_core's LocalEmbedder (sentence-transformers).
    # ``onnx`` runs the same multilingual-e5-small model through ONNX Runtime
    # with no PyTorch dependency, so a 512 MB container can serve the RAG
    # endpoint. Both paths embed with the same model; see DECISIONS.md.
    embedding_backend: str = os.environ.get("EMBEDDING_BACKEND", "torch")
    embedding_cache_size: int = max(1, int(os.environ.get("ML_EMBEDDING_CACHE_SIZE", "512")))
    onnx_model_dir: str = os.environ.get(
        "ONNX_MODEL_DIR", str(PROJECT_ROOT / "backend" / "models" / "e5-small-onnx")
    )
    onnx_threads: int = int(os.environ.get("ONNX_THREADS", "1"))
    # Storage backend for serving queries: "chroma" (default) keeps the
    # original behaviour; "numpy" serves the exact same cosine search from the
    # prebuilt export (`index.npz`), saving ~85 MB of RAM in the container.
    vector_store: str = os.environ.get("VECTOR_STORE", "chroma")
    min_score: float = float(os.environ.get("RAG_MIN_SCORE", "0.35"))
    top_k: int = int(os.environ.get("RAG_TOP_K", "5"))

    # A semantic fallback after the deterministic relevance vocabulary check.
    # It only broadens scope: the lexical gate always runs first, and the
    # semantic check must beat both an absolute score and an out-of-domain
    # margin. See app/rag/relevance.py for the calibration set.
    semantic_scope_enabled: bool = (
        os.environ.get("SEMANTIC_SCOPE_ENABLED", "true").lower() == "true"
    )
    semantic_scope_min_score: float = float(
        os.environ.get("SEMANTIC_SCOPE_MIN_SCORE", "0.82")
    )
    semantic_scope_min_margin: float = float(
        os.environ.get("SEMANTIC_SCOPE_MIN_MARGIN", "0.01")
    )
    # Extractive answers are shown only when the question shares a task word
    # with the cited chunk or the retrieval score is very high. This prevents
    # a no-key deployment from presenting an unrelated excerpt as an answer.
    extractive_min_score: float = float(
        os.environ.get("EXTRACTIVE_MIN_SCORE", "0.86")
    )

    # Abuse controls for costly public endpoints. ``sqlite`` stores hashed
    # client keys in a local file so two worker processes on the same host
    # share one window; ``memory`` is the original process-local mode.
    rate_limit_enabled: bool = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
    rate_limit_store: str = os.environ.get("RATE_LIMIT_STORE", "sqlite").lower()
    rate_limit_db_path: str = _resolve_rate_limit_db_path()
    # Optional shared store for a genuinely multi-host deployment. The default
    # deployment is single-host SQLite, which needs no extra service. Set
    # RATE_LIMIT_STORE=redis and RATE_LIMIT_REDIS_URL to share one window across
    # hosts; redis is imported lazily and a missing/broken server degrades to
    # the local memory window instead of blocking startup.
    rate_limit_redis_url: str = os.environ.get("RATE_LIMIT_REDIS_URL", "")
    rate_limit_redis_prefix: str = os.environ.get(
        "RATE_LIMIT_REDIS_PREFIX", "shebashathi:rate-limit"
    )
    rate_limit_per_minute: int = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60"))
    intake_rate_limit_per_minute: int = int(os.environ.get("INTAKE_RATE_LIMIT_PER_MINUTE", "60"))

    # Proxy trust is opt-in. When the app is reachable only through a trusted
    # reverse proxy, the proxy's sanitised X-Forwarded-For chain identifies the
    # real client; otherwise every client would share the proxy address and one
    # window. Leave this false for direct/local access: trusting the header on a
    # directly reachable service lets a caller choose its own rate-limit key.
    trust_proxy_headers: bool = (
        os.environ.get("TRUST_PROXY_HEADERS", "false").lower() == "true"
    )
    trusted_proxy_ips: list[str] = [
        item.strip()
        for item in os.environ.get("TRUSTED_PROXY_IPS", "").split(",")
        if item.strip()
    ]

@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
