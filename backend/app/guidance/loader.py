"""Status-guidance loader (fail-closed).

Serves verified, deterministic explanation data for application statuses,
diaspora guidance and fraud warnings. Every user-facing string must carry an
``https`` ``source_url`` and a ``last_verified`` date; the data file is
validated at import time, and a bad file is never served.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..services import freshness as freshness_helper

GUIDANCE_DIR = Path(__file__).resolve().parents[3] / "data" / "guidance"

_TEXT_KEYS = {"text_bn", "text_en", "meaning_bn", "meaning_en", "action_bn", "action_en"}


class GuidanceContractError(RuntimeError):
    """Raised when a guidance data file violates the rule contract."""


def _fail(guide_id: str, message: str) -> None:
    raise GuidanceContractError(f"{guide_id}: {message}")


def _require_text(guide_id: str, value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(guide_id, f"{path} must be a non-empty string")
    return value.strip()


def _require_https(guide_id: str, value: Any, path: str) -> str:
    text = _require_text(guide_id, value, path)
    if not text.startswith("https://"):
        _fail(guide_id, f"{path} must be an https URL")
    return text


def _require_date(guide_id: str, value: Any, path: str) -> str:
    text = _require_text(guide_id, value, path)
    from datetime import date
    try:
        date.fromisoformat(text)
    except ValueError as exc:
        _fail(guide_id, f"{path} is not a valid YYYY-MM-DD date")
        raise GuidanceContractError(f"{guide_id}: {exc}") from exc
    return text


def _validate_links(guide_id: str, links: Any, path: str) -> list[dict]:
    if not isinstance(links, list) or not links:
        _fail(guide_id, f"{path} must be a non-empty list")
    for index, link in enumerate(links):
        if not isinstance(link, dict):
            _fail(guide_id, f"{path}[{index}] must be an object")
        _require_text(guide_id, link.get("label_bn"), f"{path}[{index}].label_bn")
        _require_text(guide_id, link.get("label_en"), f"{path}[{index}].label_en")
        _require_https(guide_id, link.get("url"), f"{path}[{index}].url")
    return links


def _validate_text_items(guide_id: str, items: Any, path: str, require_bilingual: bool = True) -> list[dict]:
    """Validate items that carry text, a source URL and a verification date."""
    if not isinstance(items, list):
        _fail(guide_id, f"{path} must be a list")
    seen: set[str] = set()
    for index, item in enumerate(items):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            _fail(guide_id, f"{item_path} must be an object")
        item_id = _require_text(guide_id, item.get("id"), f"{item_path}.id")
        if item_id in seen:
            _fail(guide_id, f"duplicate id '{item_id}' under {path}")
        seen.add(item_id)
        if require_bilingual:
            for key in ("text_bn", "text_en"):
                text = _require_text(guide_id, item.get(key), f"{item_path}.{key}")
                item[key] = text
        else:
            for key in ("meaning_bn", "meaning_en", "action_bn", "action_en", "label"):
                text = _require_text(guide_id, item.get(key), f"{item_path}.{key}")
                item[key] = text
        _require_https(guide_id, item.get("source_url"), f"{item_path}.source_url")
        _require_date(guide_id, item.get("last_verified"), f"{item_path}.last_verified")
    return items


def _validate_guide(data: Any, guide_id: str) -> dict:
    if not isinstance(data, dict):
        _fail(guide_id, "guide file must be a JSON object")
    if _require_text(guide_id, data.get("guide_id"), "guide_id") != guide_id:
        _fail(guide_id, "guide_id must match the file name")
    service_id = _require_text(guide_id, data.get("service_id"), "service_id")
    _require_text(guide_id, data.get("title_bn"), "title_bn")
    _require_text(guide_id, data.get("title_en"), "title_en")
    _require_text(guide_id, data.get("subtitle_bn"), "subtitle_bn")
    _require_text(guide_id, data.get("subtitle_en"), "subtitle_en")
    _require_text(guide_id, data.get("fallback_bn"), "fallback_bn")
    _require_text(guide_id, data.get("fallback_en"), "fallback_en")
    _require_https(service_id, data.get("source_url"), "source_url")
    _require_date(service_id, data.get("last_verified"), "last_verified")

    how = data.get("how_to_check")
    if not isinstance(how, dict):
        _fail(guide_id, "how_to_check must be an object")
    _require_text(guide_id, how.get("title_bn"), "how_to_check.title_bn")
    _require_text(guide_id, how.get("title_en"), "how_to_check.title_en")
    _require_text(guide_id, how.get("text_bn"), "how_to_check.text_bn")
    _require_text(guide_id, how.get("text_en"), "how_to_check.text_en")
    _validate_links(guide_id, how.get("official_links"), "how_to_check.official_links")

    _validate_text_items(guide_id, data.get("statuses"), "statuses", require_bilingual=False)
    # Status entries need their five content keys the same as tips carry two.
    for item in data["statuses"]:
        for key in ("text_bn", "text_en"):
            if key not in item:
                item[key] = item["meaning_bn"] if key.endswith("_bn") else item["meaning_en"]

    _validate_text_items(guide_id, data.get("tips"), "tips")

    diaspora = data.get("diaspora")
    if not isinstance(diaspora, dict):
        _fail(guide_id, "diaspora must be an object")
    _require_text(guide_id, diaspora.get("title_bn"), "diaspora.title_bn")
    _require_text(guide_id, diaspora.get("title_en"), "diaspora.title_en")
    _validate_text_items(guide_id, diaspora.get("items"), "diaspora.items")
    _validate_links(guide_id, diaspora.get("official_links"), "diaspora.official_links")

    _validate_text_items(guide_id, data.get("fraud_warnings"), "fraud_warnings")

    for key in data:
        if key not in (
            "guide_id", "service_id", "title_bn", "title_en", "subtitle_bn",
            "subtitle_en", "source_url", "last_verified", "fallback_bn",
            "fallback_en", "how_to_check", "statuses", "tips", "diaspora",
            "fraud_warnings",
        ):
            _fail(guide_id, f"unexpected key '{key}'")
    return data


def _load_all() -> dict[str, dict]:
    catalog: dict[str, dict] = {}
    for path in sorted(GUIDANCE_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as source:
            data = json.load(source)
        guide_id = data.get("guide_id") if isinstance(data, dict) else None
        if not isinstance(guide_id, str) or not guide_id.strip():
            raise GuidanceContractError(f"{path.name}: guide_id must be a non-empty string")
        catalog[guide_id] = _validate_guide(data, guide_id)
    return catalog


_GUIDES: dict[str, dict] = _load_all()


def get_guide(service_id: str) -> dict:
    """Validated status guide content for one service, or KeyError if absent."""
    for guide in _GUIDES.values():
        if guide["service_id"] == service_id:
            guide = dict(guide)
            guide["freshness"] = freshness_helper.freshness(guide)
            return guide
    raise KeyError(service_id)


def status_text_for(status_id: str) -> dict | None:
    """The validated status entry for an id, or None (no fabrication)."""
    for guide in _GUIDES.values():
        for status in guide["statuses"]:
            if status["id"] == status_id:
                return status
    return None
