"""Index source-tagged Markdown snapshots and verified service data into Chroma."""
import argparse
import hashlib
import json
import re
import uuid
from pathlib import Path

from ..config import PROJECT_ROOT, settings
from .retriever import COLLECTION_NAME, _embedder

CORPUS_DIR = PROJECT_ROOT / "corpus"
SERVICES_DIR = PROJECT_ROOT / "data" / "services"
SERVICES_INDEX = SERVICES_DIR / "index.json"
FEE_SCHEDULES = PROJECT_ROOT / "data" / "fee_schedules.json"
INDEX_VERSION = "3"


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
        for i, text in enumerate(_chunks(body, max_chars=650, overlap=100)):
            source_key = f"{metadata['source_url']}|{i}|{hashlib.sha256(text.encode()).hexdigest()}"
            docs.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, source_key)), "text": text, "metadata": metadata})
    if not docs:
        raise RuntimeError(f"No source Markdown files found in {CORPUS_DIR}")
    return docs


def _add(
    docs: list[dict],
    *,
    service_id: str,
    section: str,
    title: str,
    text: str,
    source_url: str,
    last_verified: str,
    source_type: str,
    key: str,
) -> None:
    for index, chunk in enumerate(_chunks(text)):
        source_key = f"{service_id}|{section}|{source_type}|{key}|{index}|{hashlib.sha256(chunk.encode()).hexdigest()}"
        docs.append({
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, source_key)),
            "text": chunk,
            "metadata": {
                "service_id": service_id,
                "section": section,
                "title": title,
                "source_title": title,
                "source_url": source_url,
                "last_verified": last_verified,
                "language": "bn+en",
                "source_type": source_type,
            },
        })


def _condition_text(condition: dict) -> str:
    if not condition:
        return "always"
    return f"{condition.get('field')} {condition.get('operator')} {condition.get('value')}"


def load_service_documents() -> list[dict]:
    """Turn the validated service JSON into citable retrieval chunks.

    This is the missing bridge between the deterministic guide data and the
    copilot. Every chunk keeps its service id, official URL and review date so
    the verifier can reject unsupported citations.
    """
    if not SERVICES_INDEX.exists():
        return []
    index = json.loads(SERVICES_INDEX.read_text(encoding="utf-8"))
    docs: list[dict] = []
    for entry in index.get("services", []):
        if not entry.get("enabled"):
            continue
        path = SERVICES_DIR / entry["data_file"]
        if not path.exists():
            continue
        service = json.loads(path.read_text(encoding="utf-8"))
        service_id = service["service_id"]
        name_en = service["service_name_en"]
        name_bn = service["service_name_bn"]
        source_url = service["source_url"]
        verified = service["last_verified"]

        _add(
            docs,
            service_id=service_id,
            section="overview",
            title=f"{name_en} — overview",
            text=(
                f"{name_en} ({name_bn}) — {service['authority_en']} / {service['authority_bn']}\n\n"
                f"Summary (English): {service['summary_en']}\n\n"
                f"সারসংক্ষেপ (বাংলা): {service['summary_bn']}\n\n"
                f"Official source: {source_url}. Last verified: {verified}."
            ),
            source_url=source_url,
            last_verified=verified,
            source_type="service_data",
            key="overview",
        )

        for document in service.get("documents", []):
            _add(
                docs,
                service_id=service_id,
                section="documents",
                title=f"{name_en} — {document['label_en']}",
                text=(
                    f"{name_en} ({name_bn}) — document: {document['label_en']}\n"
                    f"{document['notes_en']}\n\n"
                    f"বাংলা: {document['label_bn']} — {document['notes_bn']}\n\n"
                    f"Source: {document['source_url']}. Last verified: {document['last_verified']}."
                ),
                source_url=document["source_url"],
                last_verified=document["last_verified"],
                source_type="service_data",
                key=f"document:{document['id']}",
            )

        catalog = {document["id"]: document for document in service.get("documents", [])}
        for task in service.get("tasks", []):
            task_title = task["label_en"]
            task_text = (
                f"{name_en} ({name_bn}) — {task_title} / {task['label_bn']}\n"
                f"Task id: {task['id']}\n\n"
                "Steps (English): " + " ".join(
                    f"{index + 1}. {step}" for index, step in enumerate(task.get("steps_en", []))
                ) + "\n\n"
                "ধাপ (বাংলা): " + " ".join(
                    f"{index + 1}. {step}" for index, step in enumerate(task.get("steps_bn", []))
                )
            )
            _add(
                docs,
                service_id=service_id,
                section="process",
                title=f"{name_en} — {task_title} steps",
                text=task_text,
                source_url=(task.get("official_links") or [{}])[0].get("url", source_url),
                last_verified=verified,
                source_type="service_data",
                key=f"task:{task['id']}:steps",
            )

            if task.get("warnings_en") or task.get("warnings_bn"):
                _add(
                    docs,
                    service_id=service_id,
                    section="warnings",
                    title=f"{name_en} — {task_title} warnings",
                    text=(
                        f"{name_en} — {task_title} / {task['label_bn']}\n\n"
                        "Warnings (English):\n- " + "\n- ".join(task.get("warnings_en", [])) +
                        "\n\nসতর্কতা (বাংলা):\n- " + "\n- ".join(task.get("warnings_bn", []))
                    ),
                    source_url=(task.get("official_links") or [{}])[0].get("url", source_url),
                    last_verified=verified,
                    source_type="service_data",
                    key=f"task:{task['id']}:warnings",
                )

            if task.get("documents"):
                lines = [
                    f"{name_en} — {task_title} / {task['label_bn']}",
                    f"Task id: {task['id']}",
                    "Required documents for this task:",
                ]
                for reference in task["documents"]:
                    document = catalog.get(reference["id"])
                    if not document:
                        continue
                    condition = "always"
                    if reference.get("conditions"):
                        condition = "; ".join(_condition_text(item) for item in reference["conditions"])
                    role = " (parent/guardian document)" if reference["id"] == "parent_nid" else ""
                    lines.append(
                        f"- {document['label_en']}{role} ({document['label_bn']}). "
                        f"{document['notes_en']} Condition: {condition}."
                    )
                lines.append(
                    "Steps (English): " + " ".join(
                        f"{index + 1}. {step}" for index, step in enumerate(task.get("steps_en", []))
                    )
                )
                referenced = [
                    catalog[reference["id"]]
                    for reference in task["documents"]
                    if reference["id"] in catalog
                ]
                has_photo_document = any(
                    "photo" in (document["id"] + " " + document["label_en"]).casefold()
                    and "photocopy" not in document["label_en"].casefold()
                    for document in referenced
                )
                all_steps = task.get("steps_en", []) + task.get("steps_bn", [])
                has_biometric_step = any(
                    "biometric" in step.casefold() or "বায়োমেট্রিক" in step
                    for step in all_steps
                )
                if not has_photo_document and has_biometric_step:
                    # Make the absence explicit so the answer model does not have
                    # to infer it, and so a "paper photo?" question is not left
                    # unanswered. This describes the verified checklist; it does
                    # not add a requirement.
                    lines.append(
                        "Photo note: this task's document list does not include a separate "
                        "paper photograph; the process includes biometric enrolment."
                    )
                _add(
                    docs,
                    service_id=service_id,
                    section="documents",
                    title=f"{name_en} — {task_title} documents",
                    text="\n".join(lines),
                    source_url=source_url,
                    last_verified=verified,
                    source_type="service_data",
                    key=f"task:{task['id']}:documents",
                )
    return docs


def _selection_text(service: dict, selection: dict) -> str:
    parameters = {parameter["id"]: parameter for parameter in service.get("parameters", [])}
    parts = []
    for key, value in selection.items():
        parameter = parameters.get(key)
        label = value
        if parameter:
            label = next(
                (option["label_en"] for option in parameter.get("options", []) if option["value"] == value),
                value,
            )
        parts.append(f"{key}={label}")
    return ", ".join(parts)


def load_fee_documents() -> list[dict]:
    """Index every verified fee rule so fee questions can be answered with a citation."""
    if not FEE_SCHEDULES.exists():
        return []
    data = json.loads(FEE_SCHEDULES.read_text(encoding="utf-8"))
    docs: list[dict] = []
    for service in data.get("services", []):
        if not service.get("available"):
            continue
        service_id = service["service_id"]
        label_en = service["label_en"]
        label_bn = service["label_bn"]
        for rule in service.get("fee_rules", []):
            selection = _selection_text(service, rule.get("selection", {}))
            components = "; ".join(
                f"{item['label_en']} {item['amount']} BDT"
                for item in rule.get("components", [])
            )
            variable = ""
            if rule.get("variable_components"):
                variable = "\nVariable: " + "; ".join(
                    f"{item['label_en']} {item['amount_per_unit']} BDT per {item['unit_field']}"
                    for item in rule["variable_components"]
                )
            _add(
                docs,
                service_id=service_id,
                section="fees",
                title=f"{label_en} fee — {selection or rule['id']}",
                text=(
                    f"{label_en} ({label_bn}) — {selection or rule['id']}\n"
                    f"Total: {rule['total']} BDT.\n"
                    f"Components: {components}.{variable}\n"
                    f"{rule.get('notes_en', '')}\n"
                    f"{rule.get('notes_bn', '')}\n"
                    f"Scope: {service.get('scope_note_en', '')}\n"
                    f"Source: {service['source_url']}. Last verified: {service['last_verified']}."
                ),
                source_url=service["source_url"],
                last_verified=service["last_verified"],
                source_type="fee_schedule",
                key=f"fee:{rule['id']}",
            )
    return docs


def load_all_documents() -> list[dict]:
    docs = load_corpus() + load_service_documents() + load_fee_documents()
    if not docs:
        raise RuntimeError("No indexable source documents were found")
    return docs


def export_numpy_index(collection=None, export_dir: str | None = None) -> int:
    """Write the exact ``index.npz`` the low-memory vector store serves from.

    Runs automatically after every rebuild and also after a no-op boot of a
    missing export, so the ``.chroma`` directory is always servable through
    ``VECTOR_STORE=numpy`` without a second embedding pass.
    """
    import json as _json

    import numpy as np

    target = Path(export_dir or settings.chroma_persist_dir)
    if collection is None:
        import chromadb

        collection = chromadb.PersistentClient(path=str(target)).get_collection(COLLECTION_NAME)
    data = collection.get(include=["documents", "metadatas", "embeddings"])
    if not data.get("ids"):
        raise RuntimeError("Cannot export an empty index")
    embeddings = np.asarray(data["embeddings"], dtype=np.float32)
    np.savez_compressed(
        target / "index.npz",
        ids=np.array(data["ids"], dtype=np.str_),
        embeddings=embeddings,
    )
    chunks = [
        {"text": document, "metadata": metadata}
        for document, metadata in zip(data["documents"], data["metadatas"])
    ]
    (target / "chunks.json").write_text(
        _json.dumps(chunks, ensure_ascii=False), encoding="utf-8"
    )
    return len(data["ids"])


def build_index(rebuild: bool = False) -> int:
    import chromadb

    docs = load_all_documents()
    client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    collection = None
    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        collection = None

    version_matches = bool(
        collection is not None
        and (collection.metadata or {}).get("index_version") == INDEX_VERSION
    )
    if collection is not None and version_matches and not rebuild and collection.count():
        export_path = Path(settings.chroma_persist_dir) / "index.npz"
        if not export_path.exists():
            export_numpy_index(collection)
        return collection.count()

    if collection is not None:
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
    collection = client.create_collection(
        COLLECTION_NAME,
        metadata={"hnsw:space": "cosine", "index_version": INDEX_VERSION},
    )

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
    export_numpy_index(collection)
    return collection.count()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rebuild", action="store_true", help="replace the current collection")
    args = parser.parse_args()
    print(f"Indexed {build_index(rebuild=args.rebuild)} source chunks")
