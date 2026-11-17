"""Intent classifier for semantic section classification.

Replaces the fragile keyword-based ``_SECTION_HINTS`` approach in retriever.py
with a model-based classifier using multilingual embeddings.

Classification approach:
1. Embed the reference examples with the E5 ``passage:`` prefix (they are
   reference text, not user questions).
2. Average and normalise each section's examples into one prototype.
3. Embed the user question with the ``query:`` prefix and return the nearest
   section prototype plus its cosine score.

Prototype embeddings are cached per process and protected by a lock so a
concurrent first request cannot build them twice.
"""

from __future__ import annotations

import threading
from typing import Dict, List, Optional

import numpy as np

from ..embeddings.embedder import LocalEmbedder


class IntentClassifier:
    """
    Semantic section classifier.

    Usage:
        classifier = IntentClassifier()
        section = classifier.predict("How much is the fee for 48 pages?")
        # returns "fees"
    """

    SECTION_META = {
        "fees": {
            "keywords": ["fee", "price", "cost", "taka", "ফি", "টাকা", "মূল্য", "অর্থ"],
            "examples": [
                "How much does a 48-page passport cost?",
                "What is the express delivery fee?",
                "Do I need to pay VAT on the passport fee?",
                "পাসপোর্টের ফি কত টাকা?",
            ],
        },
        "documents": {
            "keywords": ["document", "nid", "birth", "নথি", "কাগজ", "জন্ম", "রি-ইস্যু", "পাসপোর্ট"],
            "examples": [
                "What documents do I need for a first-time application?",
                "Do I need my previous passport for re-issue?",
                "What photo size do children under 6 need?",
                "কোন কাগজপত্র লাগবে?",
            ],
        },
        "payment": {
            "keywords": ["payment", "pay", "cash", "challan", "পেমেন্ট", "পরিশোধ", "চালান"],
            "examples": [
                "How can I pay the passport fee?",
                "Is online payment available?",
                "Which banks accept A-Challan?",
                "ফি কীভাবে পরিশোধ করব?",
            ],
        },
        "process": {
            "keywords": ["step", "steps", "how", "process", "procedure", "renew", "ধাপ", "পদ্ধতি", "প্রক্রিয়া", "নবায়ন"],
            "examples": [
                "How do I renew my passport?",
                "What are the steps for a first-time application?",
                "What is the procedure for correcting a birth record?",
                "পাসপোর্ট নবায়নের ধাপ কী?",
            ],
        },
        "grs": {
            "keywords": ["grs", "complaint", "অভিযোগ", "অসন্তুষ্টি"],
            "examples": [
                "How do I file a grievance for passport delays?",
                "What is the GRS complaint process?",
                "How to submit a complaint about document refusal?",
                "সেবা নিয়ে অভিযোগ করব কীভাবে?",
            ],
        },
    }

    def __init__(self, embedder: Optional[LocalEmbedder] = None):
        self.embedder = embedder or LocalEmbedder.get_instance()
        self._prototypes: Dict[str, np.ndarray] = {}
        self._prototype_lock = threading.Lock()

    def _compute_prototypes(self) -> Dict[str, np.ndarray]:
        """Compute one normalised average embedding per section.

        All examples are embedded in one passage batch; this is faster than one
        model call per section and keeps the E5 ``passage:`` prefix consistent.
        """
        names = list(self.SECTION_META)
        examples = [text for name in names for text in self.SECTION_META[name]["examples"]]
        vectors = np.asarray(self.embedder.embed_documents(examples), dtype=np.float32)
        if vectors.ndim == 1:
            vectors = vectors.reshape(1, -1)

        prototypes: Dict[str, np.ndarray] = {}
        start = 0
        for name in names:
            count = len(self.SECTION_META[name]["examples"])
            prototype = vectors[start:start + count].mean(axis=0)
            norm = float(np.linalg.norm(prototype)) or 1.0
            prototypes[name] = prototype / norm
            start += count
        self._prototypes = prototypes
        return prototypes

    def _ensure_prototypes(self) -> Dict[str, np.ndarray]:
        if self._prototypes:
            return self._prototypes
        with self._prototype_lock:
            if not self._prototypes:
                self._compute_prototypes()
        return self._prototypes

    def predict(self, text: str, section: Optional[str] = None) -> str:
        """Return the most likely section name for ``text``."""
        return self.predict_with_score(text, section=section)[0]

    def predict_with_score(
        self, text: str, section: Optional[str] = None
    ) -> tuple[str, float]:
        """Return ``(section, cosine_score)`` for ``text``.

        A caller-provided ``section`` short-circuits classification and reports
        a score of 1.0. That keeps the pre-existing retriever contract.
        """
        if section:
            return section, 1.0
        if not isinstance(text, str) or not text.strip():
            return "documents", 0.0

        query_text = text.strip()
        try:
            prototypes = self._ensure_prototypes()
            query_emb = np.asarray(
                self.embedder.embed_query(query_text), dtype=np.float32
            )
        except Exception:
            return self._keyword_fallback(query_text), 0.0

        if query_emb.ndim == 1:
            query_emb = query_emb.reshape(1, -1)
        norm = float(np.linalg.norm(query_emb)) or 1.0
        query_vec = (query_emb[0] / norm).astype(np.float32)

        names = list(prototypes)
        if not names:
            return self._keyword_fallback(query_text), 0.0
        matrix = np.vstack([prototypes[name] for name in names])
        scores = matrix @ query_vec
        best = int(np.argmax(scores))
        return names[best], float(scores[best])

    def clear_prototypes(self) -> None:
        """Test hook: force prototypes to be rebuilt on the next call."""
        with self._prototype_lock:
            self._prototypes = {}

    def _keyword_fallback(self, text: str) -> str:
        """Deterministic Bangla/English keyword fallback when embeddings fail."""
        lowered = text.lower()
        best_section = "documents"
        best_hits = 0
        for sec, meta in self.SECTION_META.items():
            hits = sum(1 for kw in meta.get("keywords", []) if kw and kw.lower() in lowered)
            if hits > best_hits:
                best_hits = hits
                best_section = sec
        return best_section

    def get_supported_sections(self) -> List[str]:
        """Return the list of supported section names."""
        return list(self.SECTION_META.keys())
