# ChromaVectorStore
"""Chroma vector store wrapper with model-version and corpus-version tracking.

ChromaDB collection metadata only supports flat scalar values, so the full
CollectionMeta record is stored in a JSON sidecar file next to the persisted
database (``.<collection>.ml_core_meta.json``) with a best-effort legacy
fallback to flat keys inside ``collection.metadata``.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class CollectionMeta:
    """Metadata attached to a collection for traceability."""
    model_name: str
    embedding_dim: int
    corpus_version: str
    created_at: str
    corpus_source_dir: str
    
    def as_dict(self) -> dict[str, Any]:
        return {
            "model_name": self.model_name,
            "embedding_dim": self.embedding_dim,
            "corpus_version": self.corpus_version,
            "created_at": self.created_at,
            "corpus_source_dir": self.corpus_source_dir,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CollectionMeta":
        return cls(
            model_name=str(data["model_name"]),
            embedding_dim=int(data["embedding_dim"]),
            corpus_version=str(data["corpus_version"]),
            created_at=str(data["created_at"]),
            corpus_source_dir=str(data["corpus_source_dir"]),
        )
    
def _doc_version_fields(d: dict[str, Any]) -> tuple[str, str, str, str]:
    """Support both flat dicts and CorpusDoc.as_dict() shapes."""
    meta = d.get("metadata") if isinstance(d.get("metadata"), dict) else {}
    text = str(d.get("text", ""))
    source_url = str(d.get("source_url", meta.get("source_url", "")))
    last_verified = str(d.get("last_verified", meta.get("last_verified", "")))
    return str(d.get("id", "")), text[:1000], source_url, last_verified


def _compute_corpus_version(docs: list[dict[str, Any]]) -> str:
    payload = [
        "|".join(_doc_version_fields(d))
        for d in sorted(docs, key=lambda x: str(x.get("id", "")))
    ]
    blob = "|".join(payload).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]


_META_KEY = "ml_core_meta_json"


class ChromaVectorStore:
    """Thin, version-aware wrapper around a ChromaDB collection."""
    
    def __init__(
        self,
        persist_dir,
        collection_name="epassport",
        model_name="intfloat/multilingual-e5-small",
        embedding_dim=384,
        corpus_source_dir="",
        cosine_space=True,
    ):
        self.persist_dir = Path(persist_dir)
        self.collection_name = collection_name
        self.model_name = model_name
        self.embedding_dim = embedding_dim
        self.corpus_source_dir = str(corpus_source_dir)
        self.cosine_space = cosine_space
        
        self._client = None
        self._collection = None
        self._meta = None
        self._loaded = False
    
    def _get_client(self):
        if self._client is None:
            import chromadb
            self._client = chromadb.PersistentClient(path=str(self.persist_dir))
        return self._client
    
    def _get_collection(self):
        if self._collection is not None:
            return self._collection
        client = self._get_client()
        try:
            self._collection = client.get_collection(self.collection_name)
        except Exception:
            self._collection = client.create_collection(
                self.collection_name,
                metadata={"hnsw:space": "cosine" if self.cosine_space else "l2"},
            )
        self._post_get()
        return self._collection
    
    def _meta_path(self) -> Path:
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in self.collection_name)
        return self.persist_dir / f".{safe}.ml_core_meta.json"

    def _read_meta(self) -> CollectionMeta | None:
        try:
            raw = self._meta_path().read_text(encoding="utf-8")
            return CollectionMeta.from_dict(json.loads(raw))
        except Exception:
            return None

    def _write_meta(self, meta: CollectionMeta) -> None:
        try:
            self._meta_path().write_text(json.dumps(meta.as_dict(), ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    def _post_get(self):
        stored = self._read_meta()
        if stored is not None:
            self._meta = stored
            return
        # Legacy path: version may live inside collection metadata (flat keys only).
        try:
            meta_raw = self._collection.metadata or {}
            if meta_raw.get("corpus_version") or meta_raw.get("model_name"):
                self._meta = CollectionMeta(
                    model_name=str(meta_raw.get("model_name", self.model_name)),
                    embedding_dim=int(meta_raw.get("embedding_dim", self.embedding_dim)),
                    corpus_version=str(meta_raw.get("corpus_version", "")),
                    created_at=str(meta_raw.get("created_at", "")),
                    corpus_source_dir=str(meta_raw.get("corpus_source_dir", "")),
                )
                return
        except Exception:
            pass
        self._meta = None
    
    def is_current(self, docs=None):
        if not self._meta:
            return False
        if self._meta.model_name != self.model_name:
            return False
        if self._meta.embedding_dim != self.embedding_dim:
            return False
        if docs is not None:
            actual_corpus_version = _compute_corpus_version(docs)
            return self._meta.corpus_version == actual_corpus_version
        return True
    
    def upsert(self, docs, embeddings=None):
        if not docs:
            return 0
        collection = self._get_collection()
        doc_dicts = [d.as_dict() if hasattr(d, "as_dict") else dict(d) for d in docs]
        ids = [str(d.get("id", "")) for d in doc_dicts]
        texts = [str(d.get("text", "")) for d in doc_dicts]
        metadatas = []
        for d in doc_dicts:
            meta = d.get("metadata") if isinstance(d.get("metadata"), dict) else {}
            metadatas.append(
                {k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool)) or v is None}
            )
        corpus_version = _compute_corpus_version(doc_dicts)
        meta = CollectionMeta(
            model_name=self.model_name,
            embedding_dim=self.embedding_dim,
            corpus_version=corpus_version,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            corpus_source_dir=self.corpus_source_dir,
        )
        if embeddings is None:
            from ..embeddings.embedder import LocalEmbedder

            embeddings = LocalEmbedder.get_instance().embed_documents(texts).tolist()
        vectors = [[float(v) for v in row] for row in embeddings]
        collection.upsert(ids=ids, documents=texts, metadatas=metadatas, embeddings=vectors)
        self._loaded = True
        self._meta = meta
        self._write_meta(meta)
        return len(docs)
    
    def query(self, embedding, n=5):
        collection = self._get_collection()
        try:
            total = int(collection.count())
        except Exception:
            total = 0
        if total <= 0:
            return []
        try:
            n_results = max(1, min(int(n or 5), total))
        except Exception:
            n_results = 1
        try:
            import numpy as _np
            if isinstance(embedding, _np.ndarray):
                embedding = embedding.tolist()
        except Exception:
            pass
        try:
            query_vec = [float(v) for v in list(embedding)]
        except Exception:
            return []
        if not query_vec:
            return []
        try:
            results = collection.query(
                query_embeddings=[query_vec],
                n_results=n_results,
            )
        except Exception:
            return []
        docs = []
        ids = (results.get("ids") or [[]])[0] or []
        distances = (results.get("distances") or [[]])[0] or []
        documents = (results.get("documents") or [[]])[0] or []
        metadatas = (results.get("metadatas") or [[]])[0] or []
        for i, chunk_id in enumerate(ids):
            try:
                distance = float(distances[i]) if i < len(distances) else 1.0
            except Exception:
                distance = 1.0
            score = max(0.0, min(1.0, 1.0 - distance))
            try:
                text = documents[i] if i < len(documents) else ""
            except Exception:
                text = ""
            try:
                meta = metadatas[i] if i < len(metadatas) else {}
            except Exception:
                meta = {}
            docs.append({
                "id": chunk_id,
                "text": text if isinstance(text, str) else str(text or ""),
                "metadata": meta if isinstance(meta, dict) else {},
                "distance": distance,
                "score": round(score, 4),
            })
        return docs
    
    def get(self, chunk_id):
        collection = self._get_collection()
        result = collection.get(ids=[chunk_id], include=["documents", "metadatas"])
        ids = result.get("ids") or []
        if not ids:
            return None
        docs = result.get("documents") or []
        metas = result.get("metadatas") or []
        return {
            "id": ids[0],
            "text": docs[0] if docs else "",
            "metadata": metas[0] if metas and isinstance(metas[0], dict) else {},
        }
    
    def count(self):
        try:
            return self._get_collection().count()
        except Exception:
            return 0
    
    def reset(self):
        try:
            self._get_client().delete_collection(self.collection_name)
        except Exception:
            pass
        self._collection = None
        self._meta = None
        self._loaded = False
    
    @property
    def meta(self):
        return self._meta
    
    @property
    def available(self):
        return self._loaded or self.count() > 0
