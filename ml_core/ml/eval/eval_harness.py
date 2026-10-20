"""Offline evaluation harness for the RAG pipeline.

This module provides:
1. Question setters with expected answers
2. Evaluation metrics (Retrieval Recall, Grounding, Answer Quality)
3. Results aggregation and reporting
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..pipeline.rag_pipeline import RAGPipeline


@dataclass
class EvalQuestion:
    id: str
    question: str
    expected_section: str
    expected_keywords: List[str] = field(default_factory=list)
    language: str = "bn"
    difficulty: str = "medium"
    note: str = ""


@dataclass
class EvalResult:
    question_id: str
    question: str
    expected_section: str
    section_predicted: str
    section_correct: bool
    retrieved_chunks: List[Dict[str, Any]]
    top_chunk_ids: List[str]
    answer_text: str
    answer_type: str
    groundable: bool
    time_seconds: float
    confidence: float
    difficulty: str = ""
    notes: List[str] = field(default_factory=list)

    @property
    def retrieval_recall(self) -> bool:
        return any(
            isinstance(c, dict)
            and isinstance(c.get("metadata"), dict)
            and c["metadata"].get("section") == self.expected_section
            for c in self.retrieved_chunks
        )

    @property
    def keyword_recall(self) -> bool:
        if not self.expected_keywords:
            return True
        answer = self.answer_text or ""
        lowered = answer.lower()
        for kw in self.expected_keywords:
            if kw and kw.lower() in lowered:
                return True
        return False


@dataclass
class EvalReport:
    total_questions: int
    questions: List[EvalResult]
    section_accuracy: float
    retrieval_recall: float
    keyword_recall: float
    average_confidence: float
    average_time_seconds: float
    pass_rate: float
    details: str = ""

class EvalHarness:
    def __init__(self, eval_file: Optional[Path] = None):
        self.questions: List[EvalQuestion] = []
        self._results: List[EvalResult] = []
        self.eval_file = eval_file
        if eval_file is not None:
            try:
                self.load_questions(eval_file)
            except Exception:
                pass

        self._default_questions = [
            EvalQuestion(
                id="q1",
                question="ই-পাসপোর্টের ফি কত?",
                expected_section="fees",
                expected_keywords=["ফি", "টাকা"],
                language="bn",
                difficulty="easy",
                note="Test basic fee lookup in Bangla",
            ),
            EvalQuestion(
                id="q2",
                question="What documents do I need for a first-time passport application?",
                expected_section="documents",
                expected_keywords=["nid", "document"],
                language="en",
                difficulty="easy",
                note="Test document requirements in English",
            ),
            EvalQuestion(
                id="q3",
                question="How much is the express delivery fee for a 48-page passport?",
                expected_section="fees",
                expected_keywords=["express", "fee"],
                language="en",
                difficulty="medium",
                note="Test fee with delivery option",
            ),
            EvalQuestion(
                id="q4",
                question="কোন নথি প্রয়োজন ১৮ বছরের কম বয়সীদের জন্য?",
                expected_section="documents",
                expected_keywords=["নথি", "বয়স"],
                language="bn",
                difficulty="medium",
                note="Test age-restricted document requirements",
            ),
            EvalQuestion(
                id="q5",
                question="How do I file a complaint about passport delays at the office?",
                expected_section="grs",
                language="en",
                difficulty="hard",
                note="Test GRS complaint filing",
            ),
        ]

    def add_questions(self, questions: List[EvalQuestion]):
        self.questions.extend(questions)

    def load_questions(self, json_path: Path):
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("questions", []) if isinstance(data, dict) else data
        for item in items or []:
            if not isinstance(item, dict):
                continue
            q = EvalQuestion(
                id=str(item.get("id", f"q{len(self.questions) + 1}")),
                question=str(item.get("question", "")),
                expected_section=str(item.get("expected_section", "documents")),
                expected_keywords=list(item.get("expected_keywords", []) or []),
                language=str(item.get("language", "bn")),
                difficulty=str(item.get("difficulty", "medium")),
                note=str(item.get("note", "")),
            )
            self.questions.append(q)

    def save_questions(self, json_path: Path):
        json_path = Path(json_path)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": "1.0",
            "questions": [
                {
                    "id": q.id,
                    "question": q.question,
                    "expected_section": q.expected_section,
                    "expected_keywords": q.expected_keywords,
                    "language": q.language,
                    "difficulty": q.difficulty,
                    "note": q.note,
                }
                for q in self.questions
            ]
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def run(self, pipeline: RAGPipeline, question_ids: Optional[List[str]] = None) -> List[EvalResult]:
        if question_ids:
            q_map = {q.id: q for q in self.questions}
            filtered = [q_map[qid] for qid in question_ids if qid in q_map]
        else:
            filtered = self.questions

        self._results = []

        for q in filtered:
            start_time = time.time()
            try:
                result = pipeline.query(q.question, top_k=5, min_score=0.1)
            except Exception as e:
                result = None
                notes = [f"Error running pipeline: {str(e)}"]

            if result:
                eval_result = EvalResult(
                    question_id=q.id,
                    question=q.question,
                    expected_section=q.expected_section,
                    section_predicted=result.section,
                    section_correct=(result.section == q.expected_section),
                    retrieved_chunks=result.top_chunks,
                    top_chunk_ids=[c.id for c in result.top_chunks],
                    answer_text=result.final_answer,
                    answer_type=result.generation_mode,
                    groundable=True,
                    time_seconds=time.time() - start_time,
                    confidence=result.confidence,
                    notes=[],
                )
            else:
                eval_result = EvalResult(
                    question_id=q.id,
                    question=q.question,
                    expected_section=q.expected_section,
                    section_predicted="unknown",
                    section_correct=False,
                    retrieved_chunks=[],
                    top_chunk_ids=[],
                    answer_text="",
                    answer_type="error",
                    groundable=False,
                    time_seconds=0.0,
                    confidence=0.0,
                    notes=["Pipeline returned no result"],
                )

            self._results.append(eval_result)

        return self._results

    def generate_report(self, results: Optional[List[EvalResult]] = None) -> str:
        if results is None:
            results = self._results

        if not results:
            return "No evaluation results available."

        total = len(results)
        section_acc = sum(1 for r in results if r.section_correct) / total
        retrieval_recall = sum(1 for r in results if r.retrieval_recall) / total
        keyword_recall = sum(1 for r in results if r.keyword_recall) / total
        avg_conf = sum(r.confidence for r in results) / total
        avg_time = sum(r.time_seconds for r in results) / total
        pass_rate = sum(1 for r in results if r.section_correct and r.retrieval_recall) / total

        lines = [
            "=" * 60,
            "RAG Pipeline Evaluation Report",
            "=" * 60,
            f"Total questions: {total}",
            f"Section accuracy: {section_acc:.1%}",
            f"Retrieval recall: {retrieval_recall:.1%}",
            f"Keyword recall: {keyword_recall:.1%}",
            f"Pass rate (section + retrieval): {pass_rate:.1%}",
            f"Average confidence: {avg_conf:.3f}",
            f"Average time: {avg_time:.3f}s",
            "",
            "-" * 60,
            "Detailed Results:",
            "-" * 60,
        ]

        for r in results:
            status = "PASS" if (r.section_correct and r.retrieval_recall) else "FAIL"
            lines.append(f"\n")
            lines.append(f"[{r.question_id}] ({status})")
            lines.append(f"  Question: {r.question}")
            lines.append(f"  Expected section: {r.expected_section}, Predicted: {r.section_predicted}")
            lines.append(f"  Retrieval recall: {r.retrieval_recall}, Keyword recall: {r.keyword_recall}")
            lines.append(f"  Confidence: {r.confidence:.3f}, Time: {r.time_seconds:.2f}s")
            if r.notes:
                for note in r.notes:
                    lines.append(f"  Note: {note}")

        lines.append("")
        lines.append("=" * 60)
        lines.append("Summary by difficulty:")

        details = {}
        for r in results:
            d = details.setdefault(r.difficulty, {"total": 0, "pass": 0})
            d["total"] += 1
            if r.section_correct:
                d["pass"] += 1

        for diff, d in sorted(details.items()):
            lines.append(f"  {diff}: {d['pass']}/{d['total']} passed")

        return "\n".join(lines)

    def export_results(self, results: List[EvalResult], json_path: Path):
        data = [
            {
                "question_id": r.question_id,
                "question": r.question,
                "expected_section": r.expected_section,
                "section_predicted": r.section_predicted,
                "section_correct": r.section_correct,
                "retrieval_recall": r.retrieval_recall,
                "answer_type": r.answer_type,
                "groundable": r.groundable,
                "confidence": r.confidence,
                "time_seconds": r.time_seconds,
                "answer_text": r.answer_text,
                "top_chunk_ids": r.top_chunk_ids,
            }
            for r in results
        ]
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
