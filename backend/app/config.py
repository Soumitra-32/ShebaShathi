"""
Configuration for ShebaShathi BD backend.
"""
import os
from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _resolve_persist_dir() -> str:
    """Resolve a relative Chroma path against the repository, not the cwd.

    ``uvicorn --app-dir backend``, ``python -m app.rag.ingest`` and the live
    eval script otherwise resolve ``./.chroma`` from different working
    directories and silently read an empty/old index. Production can still use
    an absolute path such as ``/app/.chroma``.
    """
    raw = os.environ.get("CHROMA_PERSIST_DIR", str(PROJECT_ROOT / ".chroma"))
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return str(path)


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

    # Optional OpenAI-compatible generation API. Empty key means extractive RAG only.
    # OpenRouter: LLM_API_BASE=https://openrouter.ai/api/v1
    llm_model: str = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    llm_api_base: str = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1")
    llm_api_key: str = os.environ.get("LLM_API_KEY", "")
    # Optional OpenRouter attribution headers (shown in the provider dashboard).
    llm_app_title: str = os.environ.get("LLM_APP_TITLE", "")
    llm_http_referer: str = os.environ.get("LLM_HTTP_REFERER", "")

    # RAG
    chroma_persist_dir: str = _resolve_persist_dir()
    embedding_model: str = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    min_score: float = float(os.environ.get("RAG_MIN_SCORE", "0.35"))
    top_k: int = int(os.environ.get("RAG_TOP_K", "5"))

    # Abuse controls for costly public endpoints. Process-local by design;
    # a multi-instance deployment should use a shared store.
    rate_limit_enabled: bool = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
    rate_limit_per_minute: int = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60"))
    intake_rate_limit_per_minute: int = int(os.environ.get("INTAKE_RATE_LIMIT_PER_MINUTE", "60"))

@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
