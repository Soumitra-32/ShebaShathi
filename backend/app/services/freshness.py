"""Review status derived only from validated service ``last_verified`` dates."""
from __future__ import annotations

from datetime import date

REVIEW_AFTER_DAYS = 180


def _parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def freshness(service: dict, today: date | None = None) -> dict:
    """Review status derived only from validated ``last_verified`` dates.

    A guide is ``stale`` when its ``last_verified`` is older than
    ``REVIEW_AFTER_DAYS``; ``due_soon`` covers the final 30 days before that.
    Unknown dates fail closed to ``unknown`` (never presented as fresh).
    """
    verified = _parse_date(service.get("last_verified", ""))
    current = today or date.today()
    if verified is None:
        return {"status": "unknown", "days_since_verified": None,
                "review_after_days": REVIEW_AFTER_DAYS}
    if verified > current:
        return {"status": "unknown", "days_since_verified": 0,
                "review_after_days": REVIEW_AFTER_DAYS}
    age = (current - verified).days
    if age > REVIEW_AFTER_DAYS:
        status = "stale"
    elif age >= REVIEW_AFTER_DAYS - 30:
        status = "due_soon"
    else:
        status = "fresh"
    return {"status": status, "days_since_verified": age,
            "review_after_days": REVIEW_AFTER_DAYS}

