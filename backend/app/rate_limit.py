"""Rate limiting for costly public endpoints.

The copilot and the AI intake can trigger embedding work and, when configured,
a paid LLM call. A per-client sliding window prevents one client from draining
the budget.

Three stores are available:

* ``memory`` — the original process-local window. Fast, but two workers on the
  same host each have their own budget.
* ``sqlite`` — a small local file shared by every worker process on the host.
  Client keys are SHA-256 hashed before storage; the raw address is never
  written. The file is transient operational state, not user data, and is
  cleared when the window expires. SQLite is the default because it adds no
  service, account or network surface.
* ``redis`` — opt-in, for a genuinely multi-host deployment. Separate hosts do
  not share a filesystem, so a shared network store is the only way to enforce
  one window globally. The adapter is imported lazily; if Redis is missing or
  unavailable the request path degrades to the local store rather than failing
  open. The default deployment stays SQLite and needs no Redis service.
"""
from __future__ import annotations

import hashlib
import ipaddress
import logging
import math
import sqlite3
import threading
import time
import uuid
from collections import deque
from pathlib import Path

from fastapi import HTTPException, Request

from .config import settings

logger = logging.getLogger(__name__)

# One atomic Lua operation keeps the Redis window correct when several hosts
# receive the same client's requests at once. The sorted set is trimmed to the
# sliding window, checked, then extended only when the request is allowed.
_REDIS_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local window = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = 1
  if oldest[2] then
    retry = math.max(1, math.ceil(tonumber(oldest[2]) + window - now))
  end
  return {0, retry}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, math.ceil(window * 1000))
return {1, 0}
"""


class SlidingWindowLimiter:
    def __init__(
        self,
        limit: int,
        window_seconds: int = 60,
        enabled: bool = True,
        store_path: str | Path | None = None,
        namespace: str = "default",
        redis_url: str | None = None,
        redis_prefix: str = "shebashathi:rate-limit",
    ):
        self.limit = max(1, int(limit))
        self.window_seconds = max(1, int(window_seconds))
        self.enabled = enabled
        self.store_path = Path(store_path).expanduser() if store_path else None
        self.namespace = namespace or "default"
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._redis = None
        self._redis_script = None
        self._redis_prefix = redis_prefix.rstrip(":") or "shebashathi:rate-limit"
        if redis_url:
            try:
                self._init_redis(redis_url)
            except Exception as exc:  # noqa: BLE001 - availability over strictness
                logger.warning(
                    "rate-limit redis init failed (%s); using local fallback",
                    type(exc).__name__,
                )
                self._redis = None
                self._redis_script = None
        if self._redis is None and self.store_path is not None:
            try:
                self._init_store()
            except (sqlite3.Error, OSError) as exc:
                # A read-only or misconfigured state path must not prevent the
                # API from starting. Degrade to the process-local window and
                # log only the error class.
                logger.warning(
                    "rate-limit store init failed (%s); using memory",
                    type(exc).__name__,
                )
                self.store_path = None

    # -- Redis store -----------------------------------------------------
    def _init_redis(self, url: str) -> None:
        import redis

        client = redis.Redis.from_url(
            url,
            socket_connect_timeout=1.0,
            socket_timeout=1.0,
            health_check_interval=30,
            decode_responses=True,
        )
        client.ping()
        self._redis = client
        self._redis_script = client.register_script(_REDIS_WINDOW_SCRIPT)

    def _allow_redis(self, key: str, now: float | None) -> tuple[bool, int]:
        current = time.time() if now is None else now
        cutoff = current - self.window_seconds
        redis_key = f"{self._redis_prefix}:{self.namespace}:{self._hashed_key(key)}"
        member = f"{current:.6f}:{uuid.uuid4().hex}"
        try:
            allowed, retry_after = self._redis_script(
                keys=[redis_key],
                args=[current, cutoff, self.limit, member, self.window_seconds],
            )
            return bool(int(allowed)), int(retry_after)
        except Exception as exc:  # noqa: BLE001 - fall back locally on outage
            logger.warning(
                "rate-limit redis unavailable (%s); using local fallback",
                type(exc).__name__,
            )
            return self._allow_local(key, now)

    # -- SQLite store ----------------------------------------------------
    def _init_store(self) -> None:
        assert self.store_path is not None
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS rate_limit_hits ("
                "key TEXT NOT NULL, ts REAL NOT NULL)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_rate_limit_key_ts "
                "ON rate_limit_hits (key, ts)"
            )

    def _connect(self) -> sqlite3.Connection:
        assert self.store_path is not None
        connection = sqlite3.connect(str(self.store_path), timeout=5)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        return connection

    def _hashed_key(self, key: str) -> str:
        # Hashing avoids persisting a raw client IP in operational state, and
        # the namespace keeps the copilot and intake windows independent.
        material = f"{self.namespace}:{key or 'unknown'}"
        return hashlib.sha256(("rate-limit:" + material).encode()).hexdigest()

    def _allow_sqlite(self, key: str, now: float | None) -> tuple[bool, int]:
        current = time.time() if now is None else now
        cutoff = current - self.window_seconds
        hashed = self._hashed_key(key)
        try:
            with self._connect() as connection:
                # BEGIN IMMEDIATE serialises concurrent writers across worker
                # processes so two requests cannot both observe an empty window.
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    "DELETE FROM rate_limit_hits WHERE key = ? AND ts <= ?",
                    (hashed, cutoff),
                )
                row = connection.execute(
                    "SELECT COUNT(*), MIN(ts) FROM rate_limit_hits WHERE key = ?",
                    (hashed,),
                ).fetchone()
                count = int(row[0] or 0)
                oldest = row[1]
                if count >= self.limit:
                    retry_after = max(
                        1, math.ceil(float(oldest) + self.window_seconds - current)
                    )
                    return False, retry_after
                connection.execute(
                    "INSERT INTO rate_limit_hits (key, ts) VALUES (?, ?)",
                    (hashed, current),
                )
                # Opportunistic cleanup of expired rows from every client.
                connection.execute(
                    "DELETE FROM rate_limit_hits WHERE ts <= ?",
                    (current - max(3600, self.window_seconds * 2),),
                )
                return True, 0
        except (sqlite3.Error, OSError) as exc:
            # Availability beats strictness here: a broken state file must not
            # take down the public endpoint. Fall back to this process's memory
            # window and log the class, never the key or an identifier.
            logger.warning("rate-limit store unavailable (%s); using memory", type(exc).__name__)
            return self._allow_memory(key, now)

    # -- memory store ----------------------------------------------------
    def _allow_memory(self, key: str, now: float | None) -> tuple[bool, int]:
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

    def _allow_local(self, key: str, now: float | None) -> tuple[bool, int]:
        if self.store_path is not None:
            return self._allow_sqlite(key, now)
        return self._allow_memory(key, now)

    # -- public API ------------------------------------------------------
    def allow(self, key: str, now: float | None = None) -> tuple[bool, int]:
        """Return ``(allowed, retry_after_seconds)`` for one request."""
        if not self.enabled:
            return True, 0
        if self._redis is not None:
            return self._allow_redis(key, now)
        return self._allow_local(key, now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
        if self._redis is not None:
            try:
                pattern = f"{self._redis_prefix}:{self.namespace}:*"
                keys = list(self._redis.scan_iter(match=pattern, count=1000))
                if keys:
                    self._redis.delete(*keys)
            except Exception as exc:  # noqa: BLE001 - reset is a test operator hook
                logger.warning("rate-limit redis reset failed (%s)", type(exc).__name__)
        if self.store_path is not None:
            try:
                with self._connect() as connection:
                    connection.execute("DELETE FROM rate_limit_hits")
            except (sqlite3.Error, OSError) as exc:
                logger.warning("rate-limit reset failed (%s)", type(exc).__name__)


def _proxy_networks(values: list[str]):
    networks = []
    for value in values:
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            # A malformed allowlist entry must not make the service trust an
            # unparseable address. Ignore it and keep the direct peer.
            continue
    return tuple(networks)


def _ip(value: str):
    try:
        return ipaddress.ip_address(value.strip().strip("[]"))
    except ValueError:
        return None


def client_key(request: Request) -> str:
    """Identify the caller without trusting a spoofable forwarding header.

    By default the direct socket address is used. Behind a reverse proxy that
    appends a sanitised ``X-Forwarded-For`` chain, set ``TRUST_PROXY_HEADERS``
    and (recommended) ``TRUSTED_PROXY_IPS`` to the proxy's address or CIDR.
    The rightmost address that is not itself a trusted proxy is used, so a
    client-supplied left-hand value cannot choose its own bucket.
    """
    peer = request.client.host if request.client and request.client.host else "unknown"
    if not settings.trust_proxy_headers:
        return peer
    forwarded = request.headers.get("x-forwarded-for", "")
    if not forwarded:
        return peer
    networks = _proxy_networks(settings.trusted_proxy_ips)
    if networks:
        peer_ip = _ip(peer)
        if peer_ip is None or not any(peer_ip in network for network in networks):
            return peer
    for candidate in reversed([part.strip() for part in forwarded.split(",") if part.strip()]):
        address = _ip(candidate)
        if address is None:
            continue
        if networks and any(address in network for network in networks):
            continue
        return str(address)
    return peer


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
