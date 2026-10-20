"""Vectorstores sub-package: version-aware ChromaDB wrapper."""
from .chroma_store import ChromaVectorStore, CollectionMeta

__all__ = ["ChromaVectorStore", "CollectionMeta"]
