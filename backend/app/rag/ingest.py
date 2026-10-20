"""Index source-tagged Markdown snapshots into persistent Chroma."""
import argparse
import hashlib
import re
import uuid
from pathlib import Path

from ..config import PROJECT_ROOT, settings
from .retriever import COLLECTION_NAME, _embedder

CORPUS_DIR = PROJECT_ROOT / "corpus"


def _parse_markdown(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        raise ValueError(f"Missing YAML-like front matter in {path.name}")
    _, front, body = raw.split("---", 2)
    metadata = {}
    for line in front.strip().splitlines():
        key, sep, value = line.partition(":")
        if sep:
            metadata[key.strip()] = value.strip().strip('"\'')
    for required in ("title", "source_url", "last_verified", "language", "section", "service_id"):
        if not metadata.get(required):
            raise ValueError(f"Missing {required} metadata in {path.name}")
    return metadata, body.strip()


def _chunks(text: str, max_chars: int = 1200, overlap: int = 180) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, current = [], ""
    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            start = 0
            while start < len(paragraph):
                chunks.append(paragraph[start:start + max_chars])
                start += max_chars - overlap
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


def load_corpus() -> list[dict]:
    docs = []
    for path in sorted(CORPUS_DIR.glob("*.md")):
        metadata, body = _parse_markdown(path)
        metadata["source_title"] = metadata["title"]
        for i, text in enumerate(_chunks(body)):
            source_key = f"{metadata['source_url']}|{i}|{hashlib.sha256(text.encode()).hexdigest()}"
            docs.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, source_key)), "text": text, "metadata": metadata})
    if not docs:
        raise RuntimeError(f"No source Markdown files found in {CORPUS_DIR}")
    return docs


def build_index(rebuild: bool = False) -> int:
    import chromadb
    docs = load_corpus()
    client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    if rebuild:
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
    collection = client.get_or_create_collection(COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
    if collection.count() and not rebuild:
        return collection.count()
    model = _embedder()
    for offset in range(0, len(docs), 32):
        batch = docs[offset:offset + 32]
        vectors = model.embed_documents([item["text"] for item in batch]).tolist()
        collection.upsert(
            ids=[item["id"] for item in batch],
            documents=[item["text"] for item in batch],
            metadatas=[item["metadata"] for item in batch],
            embeddings=vectors,
        )
    return collection.count()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rebuild", action="store_true", help="replace the current collection")
    args = parser.parse_args()
    print(f"Indexed {build_index(rebuild=args.rebuild)} source chunks")
