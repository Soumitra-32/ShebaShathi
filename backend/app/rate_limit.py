"""Small in-memory rate limiter for costly public endpoints.

The copilot and the AI intake can trigger embedding work and, when configured,
a paid LLM call. A per-client sliding window prevents one client from draining
the budget. This limiter is intentionally simple and process-local: a
multi-instance deployment should replace it with a shared store (for example
Redis) and document that limitation.
"""
from __future__ import annotations

import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int = 60, enabled: bool = True):
        self.limit = max(1, int(limit))
        self.window_seconds = max(1, int(window_seconds))
        self.enabled = enabled
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
        """Return ``(allowed, retry_after_seconds)`` for one request."""
        if not self.enabled:
            return True, 0
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        with self._lock:
            bucket = self._hits.setdefault(key or "unknown", deque())
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                retry_after = max(1, math.ceil(bucket[0] + self.window_seconds - current))
                return False, retry_after
            bucket.append(current)
            # Bound memory if many distinct clients appear behind a proxy.
            if len(self._hits) > 10_000:
                for stale_key in [k for k, v in self._hits.items() if not v]:
                    self._hits.pop(stale_key, None)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_key(request: Request) -> str:
    """Identify the caller without trusting a spoofable forwarding header.

    Render/Vercel sit in front of the app, so a multi-instance deployment may
    need to trust the proxy's sanitized header. That is a deployment decision;
    by default we use the direct socket address.
    """
    return request.client.host if request.client and request.client.host else "unknown"


def enforce(limiter: SlidingWindowLimiter, request: Request) -> None:
    allowed, retry_after = limiter.allow(client_key(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": "Too many requests. Please wait a moment and try again.",
                }
            },
            headers={"Retry-After": str(retry_after)},
        )
