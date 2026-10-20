"""
Configuration for ShebaShathi BD backend.
"""
import os
from functools import lru_cache
from pathlib import Path
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[2]


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
    llm_model: str = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    llm_api_base: str = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1")
    llm_api_key: str = os.environ.get("LLM_API_KEY", "")

    # RAG
    chroma_persist_dir: str = os.environ.get("CHROMA_PERSIST_DIR", str(PROJECT_ROOT / ".chroma"))
    embedding_model: str = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    min_score: float = float(os.environ.get("RAG_MIN_SCORE", "0.35"))
    top_k: int = 5

@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
