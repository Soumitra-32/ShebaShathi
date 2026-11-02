"""Measure retrieval parity between the torch and ONNX embedder paths.

Both paths embed the same corpus into separate Chroma directories and answer
the 30-question eval set with retrieval only (no LLM, no answer generation).
Reported, not invented: top-1/top-3 chunk agreement, per-question score deltas
and ``must_contain`` token coverage from the committed eval set.

Usage (from the repo root, after ``pip install -r backend/requirements-dev.txt``
and ``python backend/scripts/fetch_onnx_model.py``):

    python backend/scripts/eval_onnx_vs_torch.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import numpy as np  # noqa: E402

TMP = ROOT / ".tmp-test" / "eval-parity"
EVAL_PATH = ROOT / "backend" / "app" / "tests" / "eval_questions.json"


def _switch(backend: str, persist_dir: Path, vector_store: str = "chroma"):
    """Point the shared modules at one backend + store + index dir.

    backend.app.config.Settings captures env defaults at import time, so the
    values are set on the settings object directly instead of via environ.
    """
    import app.config as config
    import app.rag.retriever as retriever

    fresh = config.get_settings()
    fresh.embedding_backend = backend
    fresh.chroma_persist_dir = str(persist_dir)
    fresh.vector_store = vector_store
    config.settings = fresh
    retriever.settings = fresh
    retriever._embedder.cache_clear()
    retriever._collection.cache_clear()
    from app.rag import vector_store as store_module

    store_module.reset_store()
    retriever.OnnxEmbedder.reset()
    retriever.LocalEmbedder.reset()
    return retriever


def _normalise(text: str) -> str:
    bengali_digits = "০১২৩৪৫৬৭৮৯"
    table = str.maketrans(bengali_digits, "0123456789")
    return text.casefold().translate(table)


def build_index(backend: str, persist_dir: Path, retriever) -> int:
    if persist_dir.exists():
        shutil.rmtree(persist_dir)
    persist_dir.mkdir(parents=True)
    import app.config as config

    config.settings.chroma_persist_dir = str(persist_dir)
    retriever.settings.chroma_persist_dir = str(persist_dir)
    from app.rag.ingest import build_index as build

    print(f"index build embedder: backend={backend!r} "
          f"active={type(retriever._embedder()).__name__}")
    return build(rebuild=True)


def run_questions(retriever, questions: list[dict]) -> list[dict]:
    rows = []
    for item in questions:
        docs = retriever.retrieve(
            item["question"], top_k=5, service_id=item["service_id"]
        )
        top_ids = [d["id"] for d in docs]
        haystack = _normalise(" ".join(d["text"] for d in docs))
        hits = [token for token in item["must_contain"] if _normalise(token) in haystack]
        rows.append({
            "id": item["id"],
            "expected_section": item["expected_source_section"],
            "top1_section": docs[0]["metadata"].get("section", "") if docs else "",
            "top_ids": top_ids,
            "scores": [d["score"] for d in docs],
            "must_hits": hits,
        })
    return rows


def compare(torch_rows: list[dict], onnx_rows: list[dict]) -> bool:
    ok = True
    top1_agree = sum(t["top_ids"][:1] == o["top_ids"][:1] for t, o in zip(torch_rows, onnx_rows))
    top3_agree = sum(t["top_ids"][:3] == o["top_ids"][:3] for t, o in zip(torch_rows, onnx_rows))
    deltas = [
        max(t["scores"], default=0.0) - max(o["scores"], default=0.0)
        for t, o in zip(torch_rows, onnx_rows)
    ]
    deltas = [round(value, 6) for value in deltas if value != 0.0] or [0.0]
    torch_hits = sum(len(r["must_hits"]) > 0 for r in torch_rows)
    onnx_hits = sum(len(r["must_hits"]) > 0 for r in onnx_rows)
    print(f"top-1 identical chunks : {top1_agree}/{len(torch_rows)}")
    print(f"top-3 identical lists  : {top3_agree}/{len(torch_rows)}")
    print(f"max score delta (abs)  : mean {np.mean(np.abs(deltas)):.4f}, max {np.max(np.abs(deltas)):.4f}")
    print(f"must_contain coverage  : torch {torch_hits}/{len(torch_rows)}, onnx {onnx_hits}/{len(torch_rows)}")
    if onnx_hits < torch_hits:
        ok = False
        print("REGRESSION: ONNX retrieval answers fewer eval questions.")
        for t, o in zip(torch_rows, onnx_rows):
            if not o["must_hits"] and t["must_hits"]:
                print(f"  lost: {o['id']} torch_hits={t['must_hits']} scores_t={t['scores']} scores_o={o['scores']}")
    disagreements = [
        (t["id"], t["top1_section"], o["top1_section"])
        for t, o in zip(torch_rows, onnx_rows)
        if t["top_ids"][:1] != o["top_ids"][:1] and t["top_ids"][:3] != o["top_ids"][:3]
    ]
    if disagreements:
        print(f"Different top-1 AND top-3 on {len(disagreements)} questions (informational):")
        for qid, ts, os_ in disagreements[:10]:
            print(f"  {qid}: top1_section torch={ts} onnx={os_}")
    return ok


def main() -> int:
    questions = json.loads(EVAL_PATH.read_text(encoding="utf-8"))["questions"]
    torch_dir = TMP / "chroma-torch"
    onnx_dir = TMP / "chroma-onnx"

    print("Building torch index ...")
    torch_retriever = _switch("torch", torch_dir)
    build_index("torch", torch_dir, torch_retriever)
    torch_rows = run_questions(torch_retriever, questions)
    torch_retriever.LocalEmbedder.reset()

    print("Building onnx index ...")
    onnx_retriever = _switch("onnx", onnx_dir)
    build_index("onnx", onnx_dir, onnx_retriever)
    onnx_rows = run_questions(onnx_retriever, questions)
    onnx_retriever.OnnxEmbedder.reset()

    print("Serving the onnx index through the numpy store ...")
    numpy_retriever = _switch("onnx", onnx_dir, vector_store="numpy")
    numpy_rows = run_questions(numpy_retriever, questions)
    from app.rag import vector_store as store_module

    store_module.reset_store()

    identical_np = sum(t["top_ids"][:3] == n["top_ids"][:3] for t, n in zip(onnx_rows, numpy_rows))
    print(f"numpy vs chroma (same onnx index): top-3 identical lists {identical_np}/{len(onnx_rows)}")
    numpy_hit = sum(len(r["must_hits"]) > 0 for r in numpy_rows)
    print(f"numpy store must_contain coverage : {numpy_hit}/{len(questions)}")

    ok = compare(torch_rows, onnx_rows)
    minimal_ok = numpy_hit >= sum(len(r["must_hits"]) > 0 for r in onnx_rows)
    if not minimal_ok:
        print("REGRESSION: the numpy store answers fewer eval questions than chroma.")
        ok = False
    out = {
        "torch": torch_rows,
        "onnx": onnx_rows,
        "numpy": numpy_rows,
        "top1_agree": sum(t["top_ids"][:1] == o["top_ids"][:1] for t, o in zip(torch_rows, onnx_rows)),
        "top3_agree": sum(t["top_ids"][:3] == o["top_ids"][:3] for t, o in zip(torch_rows, onnx_rows)),
        "numpy_vs_chroma_top3": identical_np,
    }
    TMP.mkdir(parents=True, exist_ok=True)
    (TMP / "parity_report.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Full report: {TMP / 'parity_report.json'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
