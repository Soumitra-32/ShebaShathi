"""Daily official-source availability and change check.

This module fetches the public official pages that a service guide points to,
hashes the response body, and records the result in
``data/services/refresh_status.json``. It is deliberately *not* a scraper that
rewrites rules: a changed page is flagged as ``changed`` so a human can review
it and update the source-dated data file. Verified guide content is never
modified automatically.

The check is a GET-only, non-submitting request. It respects ``robots.txt`` for
the project user agent, uses a short timeout, and carries no user data.
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import request, robotparser
from urllib.parse import urlparse

SERVICES_DIR = Path(__file__).resolve().parents[3] / "data" / "services"
STATUS_FILE = SERVICES_DIR / "refresh_status.json"
CHECK_INTERVAL_HOURS = 24
_TIMEOUT_SECONDS = 15
_USER_AGENT = (
    "ShebaShathiBD-source-check/1.0 "
    "(public information availability check; no form submission)"
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None = None) -> str:
    return (value or _now()).replace(microsecond=0).isoformat()


def read_status() -> dict:
    """Return the last recorded check state, or an empty default."""
    try:
        with STATUS_FILE.open(encoding="utf-8") as source:
            data = json.load(source)
    except (OSError, json.JSONDecodeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    services = data.get("services")
    if not isinstance(services, dict):
        services = {}
    return {
        "checked_at": data.get("checked_at"),
        "interval_hours": data.get("interval_hours", CHECK_INTERVAL_HOURS),
        "next_check": data.get("next_check"),
        "services": services,
    }


def service_status(service_id: str) -> dict:
    """Public, non-sensitive status for one service."""
    state = read_status()["services"].get(service_id)
    if not isinstance(state, dict):
        return {
            "last_checked": None,
            "status": "not_checked",
            "changed_urls": [],
            "unreachable_urls": [],
            "pending_review": False,
            "interval_hours": CHECK_INTERVAL_HOURS,
        }
    return {
        "last_checked": state.get("last_checked"),
        "status": state.get("status", "not_checked"),
        "changed_urls": state.get("changed_urls", []),
        "unreachable_urls": state.get("unreachable_urls", []),
        "pending_review": bool(state.get("pending_review")),
        "interval_hours": CHECK_INTERVAL_HOURS,
    }


def service_urls(service: dict) -> list[str]:
    """All public official URLs referenced by one validated service file."""
    urls: list[str] = []
    candidates = [service.get("source_url", "")]
    candidates += [link.get("url", "") for link in service.get("official_links", [])]
    for task in service.get("tasks", []):
        candidates += [link.get("url", "") for link in task.get("official_links", [])]
    for url in candidates:
        if isinstance(url, str) and url.startswith("https://") and url not in urls:
            urls.append(url)
    return urls


def _default_fetch(url: str) -> bytes:
    req = request.Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with request.urlopen(req, timeout=_TIMEOUT_SECONDS) as response:  # noqa: S310 - public https URLs only
        return response.read(2_000_000)


def _robots_allows(url: str, cache: dict[str, robotparser.RobotFileParser | None]) -> bool:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in cache:
        parser = robotparser.RobotFileParser()
        parser.set_url(f"{origin}/robots.txt")
        try:
            parser.read()
        except Exception:
            parser = None
        cache[origin] = parser
    parser = cache[origin]
    if parser is None:
        return True
    try:
        return parser.can_fetch(_USER_AGENT, url)
    except Exception:
        return True


def check_service(
    service: dict,
    previous: dict | None = None,
    fetcher=None,
    robots_allowed=None,
    robots_cache: dict | None = None,
) -> dict:
    """Check one service's official URLs.

    ``fetcher`` and ``robots_allowed`` are injectable for tests. A first-seen
    URL is recorded without being reported as a change; a different hash is
    reported as ``changed`` and persists ``pending_review`` until a human
    updates the guide and clears the status file.
    """
    previous = previous if isinstance(previous, dict) else {}
    old_hashes = previous.get("hashes") if isinstance(previous.get("hashes"), dict) else {}
    fetch = fetcher or _default_fetch
    cache = robots_cache if robots_cache is not None else {}
    allow = robots_allowed or (lambda url: _robots_allows(url, cache))

    hashes: dict[str, str] = {}
    changed: list[str] = []
    unreachable: list[str] = []
    skipped: list[str] = []

    for url in service_urls(service):
        if not allow(url):
            skipped.append(url)
            continue
        try:
            body = fetch(url)
        except Exception:
            unreachable.append(url)
            hashes[url] = old_hashes.get(url, "")
            continue
        digest = hashlib.sha256(body).hexdigest()
        hashes[url] = digest
        old = old_hashes.get(url)
        if old and old != digest:
            changed.append(url)

    if changed:
        status = "changed"
    elif unreachable and not hashes:
        status = "unreachable"
    elif unreachable:
        status = "partial"
    else:
        status = "unchanged"

    return {
        "last_checked": _iso(),
        "status": status,
        "changed_urls": changed,
        "unreachable_urls": unreachable,
        "skipped_urls": skipped,
        "pending_review": bool(changed) or bool(previous.get("pending_review")),
        "hashes": hashes,
    }


def refresh_all(services: dict[str, dict], fetcher=None) -> dict:
    """Check every enabled service and persist the status file atomically."""
    state = read_status()
    next_services = dict(state["services"])
    robots_cache: dict[str, robotparser.RobotFileParser | None] = {}
    for service_id, service in services.items():
        if not service.get("enabled", True):
            continue
        next_services[service_id] = check_service(
            service,
            previous=next_services.get(service_id),
            fetcher=fetcher,
            robots_cache=robots_cache,
        )

    now = _now()
    payload = {
        "checked_at": _iso(now),
        "interval_hours": CHECK_INTERVAL_HOURS,
        "next_check": _iso(now + timedelta(hours=CHECK_INTERVAL_HOURS)),
        "services": next_services,
    }
    SERVICES_DIR.mkdir(parents=True, exist_ok=True)
    handle, temp_path = tempfile.mkstemp(dir=str(SERVICES_DIR), prefix=".refresh-", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as target:
            json.dump(payload, target, ensure_ascii=False, indent=2)
            target.write("\n")
        os.replace(temp_path, STATUS_FILE)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    return payload
