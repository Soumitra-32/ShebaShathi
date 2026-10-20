"""RAG pipeline - classify, retrieve, rerank, answer.

This module provides the main RAG pipeline that ties together:
1. Intent classification (section detection)
2. Vector retrieval
3. Cross-encoder reranking
4. Answer generation/composition

The pipeline is designed to be used by the backend FastAPI app.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..corpus import CorpusDoc
from ..embeddings.embedder import LocalEmbedder
from ..vectorstores.chroma_store import ChromaVectorStore
from ..classifiers.intent_classifier import IntentClassifier


@dataclass
class RetrievedChunk:
    """A retrieved chunk with scoring information."""

    id: str
    text: str
    metadata: Dict[str, Any]
    score: float
    distance: float
    section: str


@dataclass
class RAGResult:
    """Complete RAG pipeline result."""

    question: str
    section: str
    top_chunks: List[RetrievedChunk]
    final_answer: str
    generation_mode: str
    used_chunk_ids: List[str]
    confidence: float


class RAGPipeline:
    """
    End-to-end RAG pipeline.

    Pipeline stages:
    1. Classify: determine the document section (fees, documents, payment, grs)
    2. Retrieve: fetch top-k chunks from vector store
    3. Rerank: apply cross-encoder reranker (if configured)
    4. Compose: generate or extract the answer

    Usage:
        pipeline = RAGPipeline()
        result = pipeline.query("How much is the passport fee?", top_k=5)
        print(result.final_answer)
    """

    def __init__(
        self,
        embedder: Optional[LocalEmbedder] = None,
        chroma_store: Optional[ChromaVectorStore] = None,
        intent_classifier: Optional[IntentClassifier] = None,
        reranker_model: Optional[str] = None,
    ):
        self.embedder = embedder or LocalEmbedder.get_instance()
        self.chroma_store = chroma_store
        self.intent_classifier = intent_classifier or IntentClassifier()

        # Cross-encoder reranker (optional)
        self.reranker_model = reranker_model
        self._reranker = None
        if reranker_model:
            self._init_reranker()

    def _init_reranker(self):
        """Initialize the cross-encoder reranker."""
        try:
            from sentence_transformers import CrossEncoder
            self._reranker = CrossEncoder(self.reranker_model)
        except ImportError:
            self._reranker = None
            print("Warning: sentence_transformers not installed. Reranking disabled.")

    def _rerank(
        self,
        query_text: str,
        chunks: List[Dict[str, Any]],
        top_n: int = 3,
    ) -> List[Dict[str, Any]]:
        """Rerank retrieved chunks using a cross-encoder.

        NOTE: CrossEncoder.predict expects (query_text, doc_text) string
        pairs — never embedding vectors.
        """
        try:
            top_n = max(1, int(top_n or 3))
        except Exception:
            top_n = 3
        if not self._reranker or not chunks:
            return list(chunks[:top_n])

        pairs = [[str(query_text or ""), str(c.get("text", "") if isinstance(c, dict) else "")] for c in chunks]

        try:
            scores = self._reranker.predict(pairs)
            scored = list(zip(chunks, list(scores)))
            scored.sort(key=lambda x: float(x[1]), reverse=True)
            return [c for c, _ in scored[:top_n]]
        except Exception:
            def _score(c: Dict[str, Any]) -> float:
                try:
                    return float(c.get("score", 0.0)) if isinstance(c, dict) else 0.0
                except Exception:
                    return 0.0
            return sorted(chunks, key=_score, reverse=True)[:top_n]

    def search(self, query, top_k=5, min_score=0.35):
        """Search the vector store for the query."""
        if self.chroma_store is None:
            raise RuntimeError("RAGPipeline has no chroma_store configured")
        if not isinstance(query, str) or not query.strip():
            return []
        try:
            top_k = max(1, int(top_k or 5))
        except Exception:
            top_k = 5
        section = self.intent_classifier.predict(query)
        query_emb = self.embedder.embed_single(query)
        candidates = self.chroma_store.query(query_emb, n=top_k)
        if not candidates:
            return []
        if min_score is not None:
            try:
                threshold = float(min_score)
                filtered = [c for c in candidates if isinstance(c, dict) and float(c.get("score", 0.0)) >= threshold]
                # Keep best candidate even if all fall below threshold so UX degrades gracefully.
                candidates = filtered or candidates[:1]
            except Exception:
                pass
        reranked = self._rerank(str(query), candidates, top_n=min(top_k, 3))
        results = []
        for c in reranked:
            try:
                meta = c.get("metadata") if isinstance(c.get("metadata"), dict) else {}
            except Exception:
                meta = {}
            results.append(RetrievedChunk(
                id=str(c.get("id", "")), text=str(c.get("text", "")), metadata=meta,
                score=float(c.get("score", 0.0)), distance=float(c.get("distance", 1.0)), section=section))
        return results

    def query(self, question, top_k=5, min_score=0.35):
        section = self.intent_classifier.predict(question)
        chunks = self.search(question, top_k=top_k, min_score=min_score)
        if not chunks:
            return RAGResult(question=question, section=section, top_chunks=[], final_answer="", generation_mode="unavailable", used_chunk_ids=[], confidence=0.0)
        top_chunks = chunks[:min(top_k, 3)]
        best_chunk = top_chunks[0]
        return RAGResult(question=question, section=section, top_chunks=top_chunks, final_answer=best_chunk.text, generation_mode="extractive", used_chunk_ids=[best_chunk.id], confidence=best_chunk.score)

    def document_sections(self):
        return self.intent_classifier.get_supported_sections()