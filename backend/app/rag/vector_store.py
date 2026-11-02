"""Minimal numpy vector store for tiny-memory deployments.

Render's free tier allows 512 MB, and importing chromadb plus opening a
PersistentClient costs ~85 MB on top of the ONNX embedder. This store answers
the same ``query``/``get``/``count`` calls the retriever already makes, from a
prebuilt index (``index.npz`` + ``chunks.json``, exported by ``ingest.py``).

Chroma remains the source of truth at build time and in local development;
this module only replaces the runtime *query* side (exact cosine search over
unit-normalised vectors; the retrieval semantics are unchanged).

Metadata predicates deliberately support only what the retriever emits:
flat equality filters, optionally under a single ``$and``. Anything else
raises ``ValueError`` instead of silently returning the wrong chunks.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from ..config import settings

DOC_KEYS = ("ids", "documents", "metadatas", "distances")


class NumpyStore:
    """Read-only prebuilt index exposing the chroma collection surface."""

    def __init__(self, persist_dir: str | Path):
        base = Path(persist_dir)
        npz_path = base / "index.npz"
        chunks_path = base / "chunks.json"
        if not npz_path.exists() or not chunks_path.exists():
            raise RuntimeError(
                "numpy vector index is missing; run `python -m app.rag.ingest` "
                "(with the same embedder used to build it) to create it"
            )
        archive = np.load(npz_path, allow_pickle=False)
        self._embeddings = np.ascontiguousarray(archive["embeddings"], dtype=np.float32)
        self._ids = [str(value) for value in archive["ids"].tolist()]
        chunks = json.loads(chunks_path.read_text(encoding="utf-8"))
        if len(chunks) != len(self._ids):
            raise RuntimeError("vector index and chunk metadata are out of sync")
        self._texts = [chunk["text"] for chunk in chunks]
        self._metadatas = [chunk["metadata"] for chunk in chunks]
        self._by_id = {chunk_id: index for index, chunk_id in enumerate(self._ids)}

    # -- query surface (same call/response shape as chroma collections) -----
    @staticmethod
    def _matches(metadata: dict[str, Any], predicate: dict[str, Any]) -> bool:
        key = next(iter(predicate))
        value = predicate[key]
        if key == "$and":
            return all(
                NumpyStore._matches(metadata, sub) if isinstance(sub, dict)
                else False
                for sub in value
            )
        if key.startswith("$"):
            raise ValueError(f"Unsupported vector-store predicate: {key}")
        if isinstance(value, dict):
            raise ValueError(f"Unsupported vector-store operator on '{key}': {next(iter(value))}")
        return metadata.get(key) == value

    def _filter_mask(self, where: dict[str, Any] | None) -> np.ndarray | None:
        if not where:
            return None
        mask = np.fromiter(
            (self._matches(metadata, where) for metadata in self._metadatas),
            dtype=bool,
            count=len(self._metadatas),
        )
        if not mask.any():
            # Nothing can match; a sentinel row keeps selection code uniform.
            mask = np.zeros(len(self._texts), dtype=bool)
        return mask

    def query(
        self,
        *,
        query_embeddings: list[list[float]],
        n_results: int,
        where: dict[str, Any] | None = None,
        **_ignored,
    ) -> dict[str, list]:
        vector = np.asarray(query_embeddings[0], dtype=np.float32)
        norm = float(np.linalg.norm(vector)) or 1.0
        similarities = (self._embeddings @ (vector / norm)).astype(np.float32)
        mask = self._filter_mask(where)
        if mask is not None:
            similarities = np.where(mask, similarities, np.float32(-2.0))
        limit = min(max(int(n_results), 0), len(self._texts))
        if limit == 0:
            return {key: [[]] for key in DOC_KEYS}
        order = np.argsort(-similarities, kind="stable")[:limit]
        order = order[similarities[order] > -1.0]  # drop rows excluded by filter
        return {
            "ids": [[self._ids[index] for index in order]],
            "documents": [[self._texts[index] for index in order]],
            "metadatas": [[self._metadatas[index] for index in order]],
            "distances": [[round(1.0 - float(similarities[index]), 6) for index in order]],
        }

    def get(self, *, ids: list[str], include: list[str] | None = None, **_ignored) -> dict[str, list]:
        result: dict[str, list] = {"ids": [], "documents": [], "metadatas": []}
        for chunk_id in ids:
            index = self._by_id.get(chunk_id)
            if index is None:
                continue
            result["ids"].append(chunk_id)
            result["documents"].append(self._texts[index])
            result["metadatas"].append(self._metadatas[index])
        return result

    def count(self) -> int:
        return len(self._ids)


@lru_cache(maxsize=1)
def _store_for(persist_dir: str) -> NumpyStore:
    return NumpyStore(persist_dir)


def get_store() -> NumpyStore:
    return _store_for(settings.chroma_persist_dir)


def reset_store() -> None:
    _store_for.cache_clear()
