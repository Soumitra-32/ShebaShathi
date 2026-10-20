"""
Corpus builder — builds RAG chunks from source Markdown files.

This module is designed to live in ml_core so both the backend RAG pipeline
and the backend ingestion layer share a single, deterministic source of
truth for corpus loading, chunking and metadata augmentation.

All chunking logic lives here. The backend ingestion layer (backend/app/rag/ingest.py)
is kept thin and delegates to this function.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from .config import get_ml_settings

Section = Literal["fees", "documents", "payment", "grs"]


@dataclass(frozen=True)
class CorpusDoc:
    """A single chunk ready for vector storage."""

    id: str
    text: str
    metadata: dict[str, str | int | float | bool]
    section: Section
    source_title: str
    source_url: str
    last_verified: str

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "metadata": self.metadata,
            "section": self.section,
            "source_title": self.source_title,
            "source_url": self.source_url,
            "last_verified": self.last_verified,
        }


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _chunks(text: str, max_chars: int = 1200, overlap: int = 180) -> list[str]:
    """
    Split text into chunks that respect paragraph boundaries.

    1. Split on double newlines (paragraphs).
    2. If a paragraph is longer than max_chars, force-split it with overlap.
    3. Otherwise, accumulate paragraphs into a chunk up to max_chars.
    """
    max_chars = max(200, int(max_chars or 1200))
    # Clamp overlap so the force-split loop always makes progress.
    overlap = max(0, min(int(overlap or 0), max_chars - 1))
    step = max_chars - overlap
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            start = 0
            while start < len(paragraph):
                chunks.append(paragraph[start : start + max_chars])
                start += step
            continue

        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if len(candidate) > max_chars and current:
            chunks.append(current)
            tail = current[-overlap:]
            current = f"{tail}\n\n{paragraph}"
        else:
            current = candidate

    if current:
        chunks.append(current)

    return chunks


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_corpus(
    corpus_dir: Path,
    *,
    section_field: str = "section",
    max_chars: int = 1200,
    overlap: int = 180,
    settings = None,
) -> list[CorpusDoc]:
    """
    Load all Markdown source files from corpus_dir and return chunk objects.

    Each file must start with YAML-style front matter:

        ---
        title: ...
        source_url: https://...
        last_verified: YYYY-MM-DD
        language: bn|en
        section: fees|documents|payment|grs
        ---

    Raises ValueError if front matter is missing required keys.
    """
    if settings is None:
        settings = get_ml_settings()
    corpus_dir = Path(corpus_dir)
    if not corpus_dir.exists():
        raise FileNotFoundError(f"Corpus directory not found: {corpus_dir}")

    docs: list[CorpusDoc] = []
    md_files = sorted(corpus_dir.glob("*.md"))

    if not md_files:
        raise RuntimeError(f"No source Markdown files found in {corpus_dir}")

    for path in md_files:
        raw = path.read_text(encoding="utf-8")
        if not raw.startswith("---\n"):
            raise ValueError(f"Missing YAML-like front matter in {path.name}")

        _, front, body = raw.split("---", 2)
        metadata: dict[str, str] = {}
        for line in front.strip().splitlines():
            key, sep, value = line.partition(":")
            if sep:
                metadata[key.strip()] = value.strip().strip('"\'')

        for required in ("title", "source_url", "last_verified", "section"):
            if not metadata.get(required):
                raise ValueError(f"Missing '{required}' in front matter of {path.name}")

        # Normalise the section field.
        section = metadata[section_field].lower()
        if section not in ("fees", "documents", "payment", "grs"):
            # Fall back to "documents" for unknown sections to avoid crashes.
            section = "documents"

        for i, text in enumerate(_chunks(body, max_chars=max_chars, overlap=overlap)):
            source_key = f"{metadata['source_url']}|{i}|{hashlib.sha256(text.encode('utf-8')).hexdigest()}"
            doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, source_key))
            doc = CorpusDoc(
                id=doc_id,
                text=text,
                metadata={
                    "section": section,
                    "source_title": metadata["title"],
                    "source_url": metadata["source_url"],
                    "last_verified": metadata["last_verified"],
                },
                section=section,
                source_title=metadata["title"],
                source_url=metadata["source_url"],
                last_verified=metadata["last_verified"],
            )
            docs.append(doc)

    return docs
