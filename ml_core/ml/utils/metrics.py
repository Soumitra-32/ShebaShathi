"""Ranking metrics used by the offline eval harness (no extra deps)."""
from __future__ import annotations

from typing import Collection, Iterable, Sequence


def compute_recall_at_k(retrieved_ids: Sequence[str], relevant_ids: Collection[str], k: int) -> float:
    """Fraction of relevant ids present in the top-k retrieved ids."""
    if not relevant_ids:
        return 1.0
    top = set(retrieved_ids[: max(0, k)])
    hits = sum(1 for rid in relevant_ids if rid in top)
    return hits / len(relevant_ids)


def compute_mrr(ranked_runs: Iterable[Sequence[str]], relevant_ids: Collection[str]) -> float:
    """Mean reciprocal rank of the first relevant doc across runs."""
    relevant = set(relevant_ids)
    scores: list[float] = []
    for ranked in ranked_runs:
        rank = next((i + 1 for i, doc_id in enumerate(ranked) if doc_id in relevant), 0)
        scores.append(1.0 / rank if rank else 0.0)
    return sum(scores) / len(scores) if scores else 0.0


def mean_scores(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0
