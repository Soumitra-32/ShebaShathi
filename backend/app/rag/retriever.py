"""Chroma retrieval using multilingual E5 embeddings."""
from functools import lru_cache
import sys
from typing import Any

from ..config import PROJECT_ROOT, settings

# The shared multilingual embedder lives in the single retained ml_core package.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from ml_core.ml.embeddings.embedder import LocalEmbedder

COLLECTION_NAME = "sources"
_SECTION_HINTS = {
    # Only explicit document words belong here. Generic service nouns such as
    # "NID" or "passport" used to force every question into the documents
    # section, hiding process and warning chunks that actually held the answer.
    "documents": ("document", "documents", "papers", "proof", "নথি", "কাগজ", "প্রমাণ"),
    "fees": ("fee", "fees", "price", "cost", "taka", "ফি", "টাকা", "মূল্য"),
    "payment": ("payment", "pay", "challan", "shurjopay", "পেমেন্ট", "পরিশোধ", "চালান"),
    "process": ("step", "steps", "how", "process", "procedure", "renew", "renewal",
                "reissue", "ধাপ", "পদ্ধতি", "নবায়ন"),
    "grs": ("grs", "complaint", "অভিযোগ", "অসন্তুষ্টি"),
}


def infer_section(question: str) -> str | None:
    value = question.casefold()
    for section, terms in _SECTION_HINTS.items():
        if any(term in value for term in terms):
            return section
    return None


@lru_cache(maxsize=1)
def _embedder():
    try:
        return LocalEmbedder.get_instance(settings.embedding_model)
    except TypeError:
        # Pre-existing ml_core constructor does not accept a model_name kwarg.
        # Fall back to the documented no-argument singleton, which reads the
        # same EMBEDDING_MODEL environment variable. ml_core is left untouched.
        return LocalEmbedder()


def embed_query(text: str):
    return _embedder().embed_query(text).tolist()


@lru_cache(maxsize=1)
def _collection():
    import chromadb
    client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    return client.get_collection(COLLECTION_NAME)


def collection_count() -> int:
    try:
        return _collection().count()
    except Exception:
        return 0


def _where(filters: dict[str, Any]) -> dict[str, Any] | None:
    if not filters:
        return None
    if len(filters) == 1:
        return filters
    return {"$and": [{key: value} for key, value in filters.items()]}


def _query(collection, question: str, filters: dict[str, Any], limit: int,
           threshold: float) -> list[dict[str, Any]]:
    args: dict[str, Any] = {
        "query_embeddings": [embed_query(question)],
        "n_results": limit,
    }
    where = _where(filters)
    if where is not None:
        args["where"] = where
    results = collection.query(**args)
    docs = []
    for i, chunk_id in enumerate(results.get("ids", [[]])[0]):
        metadata = results.get("metadatas", [[]])[0][i] or {}
        distance = (results.get("distances") or [[1.0]])[0][i]
        score = max(0.0, min(1.0, 1.0 - float(distance)))
        if score < threshold:
            continue
        docs.append({
            "id": chunk_id,
            "text": results["documents"][0][i],
            "metadata": metadata,
            "score": round(score, 4),
        })
    return docs


def retrieve(question: str, top_k: int | None = None, min_score: float | None = None,
             service_id: str | None = None) -> list[dict[str, Any]]:
    collection = _collection()
    count = collection.count()
    if count == 0:
        return []
    section = infer_section(question)
    filters: dict[str, Any] = {}
    if service_id:
        filters["service_id"] = service_id
    threshold = settings.min_score if min_score is None else min_score
    limit = min(top_k or settings.top_k, count)

    docs = []
    if section:
        docs = _query(collection, question, {**filters, "section": section}, limit, threshold)
    # A wrong section hint must not turn a known answer into a dead end. Retry
    # once without the section filter while keeping the service boundary.
    if not docs:
        docs = _query(collection, question, filters, limit, threshold)
    return docs


def get_chunk(chunk_id: str) -> dict[str, Any] | None:
    result = _collection().get(ids=[chunk_id], include=["documents", "metadatas"])
    if not result.get("ids"):
        return None
    return {"id": result["ids"][0], "text": result["documents"][0], "metadata": result["metadatas"][0]}


def reset_clients() -> None:
    """Test hook to clear cached Chroma/model clients."""
    _collection.cache_clear()
    _embedder.cache_clear()
