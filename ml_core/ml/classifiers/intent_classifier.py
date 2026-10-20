"""Intent classifier for semantic section classification.

Replaces the fragile keyword-based _SECTION_HINTS approach in retriever.py
with a model-based classifier using multilingual embeddings.

Classification approach:
1. Embed the query using the same multilingual embedding model used for indexing
2. Compare against section-specific prototype embeddings
3. Return the section with highest cosine similarity

Prototype embeddings are computed from the corpus documents in each section.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..embeddings.embedder import LocalEmbedder
from ..config import settings


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
            "keywords": ["fee", "price", "cost", "ফি", "টাকা", "মূল্য", "অর্থ"],
            "examples": [
                "How much does a 48-page passport cost?",
                "What is the express delivery fee?",
                "Do I need to pay VAT on the passport fee?",
            ],
        },
        "documents": {
            "keywords": ["document", "nid", "birth", "নথি", "কাগজ", "জন্ম", "রি-ইস্যু", "পাসপোর্ট"],
            "examples": [
                "What documents do I need for a first-time application?",
                "Do I need my previous passport for re-issue?",
                "What photo size do children under 6 need?",
            ],
        },
        "payment": {
            "keywords": ["payment", "pay", "cash", "পেমেন্ট", "পরিশোধ", "চালান"],
            "examples": [
                "How can I pay the passport fee?",
                "Is online payment available?",
                "Which banks accept A-Challan?",
            ],
        },
        "grs": {
            "keywords": ["grs", "complaint", "অভিযোগ", "অসন্তুষ্টি"],
            "examples": [
                "How do I file a grievance for passport delays?",
                "What is the GRS complaint process?",
                "How to submit a complaint about document refusal?",
            ],
        },
    }

    def __init__(self, embedder: Optional[LocalEmbedder] = None):
        self.embedder = embedder or LocalEmbedder.get_instance()
        self._prototypes: Dict[str, List[float]] = {}

    def _compute_prototypes(self) -> Dict[str, List[float]]:
        """Compute average embedding for each section from examples."""
        prototypes = {}
        for section, meta in self.SECTION_META.items():
            all_embeddings = []
            for example in meta["examples"]:
                emb = self.embedder.embed_single(example).tolist()
                all_embeddings.append(emb)
            # Average embeddings as prototype
            avg = [sum(col) / len(col) for col in zip(*all_embeddings)]
            prototypes[section] = avg
        self._prototypes = prototypes
        return prototypes

    def predict(self, text: str, section: Optional[str] = None) -> str:
        """
        Classify a question into a section.

        Args:
            text: The question text to classify.
            section: If provided, shortcut to this section (used by retriever.py).

        Returns:
            The predicted section name.
        """
        if section:
            return section
        if not isinstance(text, str) or not text.strip():
            return "documents"

        query_text = text.strip()
        try:
            query_emb = self.embedder.embed_single(query_text)
        except Exception:
            return self._keyword_fallback(query_text)

        if not self._prototypes:
            try:
                self._compute_prototypes()
            except Exception:
                return self._keyword_fallback(query_text)
        if not self._prototypes:
            return self._keyword_fallback(query_text)
        best_section = None
        best_score = -2.0

        for sec, proto in self._prototypes.items():
            # Compute cosine similarity
            try:
                dot = sum(float(a) * float(b) for a, b in zip(query_emb, proto))
                norm_a = sum(float(a) * float(a) for a in query_emb) ** 0.5
                norm_b = sum(float(b) * float(b) for b in proto) ** 0.5
            except Exception:
                continue
            if norm_a > 0 and norm_b > 0:
                score = dot / (norm_a * norm_b)
            else:
                score = -1.0

            if score > best_score:
                best_score = score
                best_section = sec

        if best_section is None:
            return self._keyword_fallback(query_text)
        return best_section

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
