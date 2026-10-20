"""Deterministic answer composer.

This module composes the final answer from retrieved chunks.
Currently it uses extractive mode (returns the best chunk text).
Future: integrate generative LLM for abstractive answers.

The composer ensures:
- No unsupported claims (only cite retrieved content)
- Proper attribution to source chunks
- Language consistency with user's question
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..corpus import CorpusDoc
from ..embeddings.embedder import LocalEmbedder
from ..vectorstores.chroma_store import ChromaVectorStore


class AnswerComposer:
    """
    Compose answers from retrieved chunks.

    Usage:
        composer = AnswerComposer()
        answer = composer.compose(question, chunks)
        # answer = {"text": "...", "chunk_ids": [...]}
    """

    def __init__(self, embedder: Optional[LocalEmbedder] = None):
        self.embedder = embedder or LocalEmbedder.get_instance()

    def compose(
        self,
        question: str,
        chunks: List[Dict[str, Any]],
        language: str = "bn",
        top_k: int = 1,
    ) -> Dict[str, Any]:
        """
        Compose the final answer from retrieved chunks.

        Args:
            question: The user's question.
            chunks: List of retrieved chunks (dicts with id, text, metadata).
            language: "bn" or "en" - for future multilingual answer synthesis.
            top_k: Number of chunks to use (default 1 for extractive).

        Returns:
            Dict with "text", "chunk_ids", "sources" (list of source titles).
        """
        if not chunks:
            return {
                "text": "",
                "chunk_ids": [],
                "sources": [],
                "answer_type": "unavailable",
            }

        # Use top_k best chunks
        top_chunks = chunks[:top_k]

        # Extractive: return the best chunk text
        best_chunk = top_chunks[0]
        chunk_ids = [c["id"] for c in top_chunks]
        sources = [c["metadata"].get("source_title", "Official source") for c in top_chunks]

        answer = {
            "text": best_chunk["text"],
            "chunk_ids": chunk_ids,
            "sources": sources,
            "answer_type": "extractive",
            "language": language,
            "used_chunk_count": len(chunk_ids),
        }

        # For multilingual support (future):
        # if language == "en" and self._is_bn_text(best_chunk["text"]):
        #     answer["text"] = self._translate_or_summarize_bn_to_en(best_chunk["text"])

        return answer

    def compose_with_context(
        self,
        question: str,
        chunks: List[Dict[str, Any]],
        previous_answer: Optional[str] = None,
        top_k: int = 2,
    ) -> Dict[str, Any]:
        """
        Compose answer with context from previous answers (conversation mode).

        This is a placeholder for future conversational RAG capabilities.
        """
        combined_context = question
        if previous_answer:
            combined_context = f"{previous_answer}\n\nQ: {question}"

        return self.compose(combined_context, chunks, top_k=top_k)

    def _is_bn_text(self, text: str) -> bool:
        """Check if text contains Bengali characters (future language detection)."""
        bn_chars = set("অআইঈউঊঋঌএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহাািঀেেোোৃৄ৅৆েৈ৉৊ৌৎ৏৑৒৓৖়ড়ঢ়য়ৢৣ৤৥")
        return any(c in bn_chars for c in text)

    def set_embedder(self, embedder: LocalEmbedder):
        """Set a new embedder instance."""
        self.embedder = embedder
