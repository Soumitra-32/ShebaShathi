"""Chroma retrieval using multilingual E5 embeddings."""
from functools import lru_cache
import sys
from typing import Any

from ..config import PROJECT_ROOT, settings
from ..privacy import contains_sensitive_data

# The shared multilingual embedder lives in the single retained ml_core package.
# ml_core imports sentence-transformers lazily, so this import stays cheap in
# the ONNX-only production image; the torch path only loads on demand.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from ml_core.ml.embeddings.embedder import LocalEmbedder

from .onnx_embedder import OnnxEmbedder

COLLECTION_NAME = "sources"
_SECTION_HINTS = {
    # Only explicit document words belong here. Generic service nouns such as
    # "NID" or "passport" used to force every question into the documents
    # section, hiding process and warning chunks that actually held the answer.
    "documents": ("document", "documents", "papers", "proof", "নথি", "কাগজ", "প্রমাণ"),
    "fees": ("fee", "fees", "price", "cost", "taka", "delivery", "processing time",
             "ফি", "টাকা", "মূল্য", "ডেলিভারি", "কত দিন", "কত সময়"),
    "payment": ("payment", "pay", "challan", "shurjopay", "পেমেন্ট", "পরিশোধ", "চালান"),
    "process": ("step", "steps", "how", "process", "procedure", "renew", "renewal",
                "reissue", "ধাপ", "পদ্ধতি", "প্রক্রিয়া", "নবায়ন",
                "কীভাবে", "কিভাবে", "আবেদন"),
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
    """Return the configured embedder without importing torch eagerly.

    ``EMBEDDING_BACKEND=onnx`` keeps PyTorch out of the process entirely so the
    RAG endpoint fits a 512 MB free container. The default ``torch`` path
    preserves the original local/evaluation behaviour.
    """
    if settings.embedding_backend == "onnx":
        return OnnxEmbedder.get_instance()
    try:
        return LocalEmbedder.get_instance(settings.embedding_model)
    except TypeError:
        # Pre-existing ml_core constructor does not accept a model_name kwarg.
        # Fall back to the documented no-argument singleton, which reads the
        # same EMBEDDING_MODEL environment variable. ml_core is left untouched.
        return LocalEmbedder()


def embed_query(text: str):
    # Never retain an embedding derived from a question that looks like it
    # contains identity data. The screen is shape-only and may false-positive,
    # which only skips the cache for that request.
    use_cache = not contains_sensitive_data(text)
    return _embedder().embed_query(text, use_cache=use_cache).tolist()


def embed_queries(texts: list[str]):
    """Embed several queries with the E5 ``query:`` prefix.

    Used by the semantic relevance fallback. The embedder is the same object
    retrieval uses, so this adds no second model to memory. Sensitive-looking
    text is embedded but not cached.
    """
    use_cache = not any(contains_sensitive_data(text) for text in texts)
    return _embedder().embed(texts, task="query", use_cache=use_cache)


def embed_passages(texts: list[str]):
    """Embed reference phrases with the E5 ``passage:`` prefix.

    E5 is trained with asymmetric query/passage prefixes. The semantic-scope
    prototypes are reference phrases, not user questions, so embedding them as
    passages gives a better-calibrated neighbourhood than sending both sides
    through the query encoder.
    """
    return _embedder().embed(texts, task="passage")


@lru_cache(maxsize=1)
def _collection():
    if settings.vector_store == "numpy":
        from .vector_store import get_store
        return get_store()
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
             service_id: str | None = None, language: str | None = None) -> list[dict[str, Any]]:
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

    # Service chunks are now indexed once per language, so a no-key excerpt
    # cannot mix Bangla and English labels. Try the requested language first;
    # fall back to all languages when that language has no indexed source (for
    # example an English question whose only official snapshot is Bangla).
    language_filters: list[dict[str, Any]] = []
    if language in ("bn", "en"):
        language_filters.append({**filters, "language": language})
    language_filters.append(filters)

    for active in language_filters:
        docs = []
        if section:
            docs = _query(collection, question, {**active, "section": section}, limit, threshold)
        # A wrong section hint must not turn a known answer into a dead end.
        # Retry once without the section filter while keeping the boundary.
        if not docs:
            docs = _query(collection, question, active, limit, threshold)
        if docs:
            return docs
    return []


def get_chunk(chunk_id: str) -> dict[str, Any] | None:
    result = _collection().get(ids=[chunk_id], include=["documents", "metadatas"])
    if not result.get("ids"):
        return None
    return {"id": result["ids"][0], "text": result["documents"][0], "metadata": result["metadatas"][0]}


def reset_clients() -> None:
    """Test hook to clear cached Chroma/model clients."""
    _collection.cache_clear()
    _embedder.cache_clear()
    from .vector_store import reset_store
    reset_store()
    OnnxEmbedder.reset()
