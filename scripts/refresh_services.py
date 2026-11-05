"""Run the daily official-source check for every enabled service guide.

Usage (from the repository root):

    $env:PYTHONPATH = "backend"
    python scripts/refresh_services.py

Schedule this once a day (cron, Task Scheduler, or the included GitHub
Actions workflow). A changed official page is flagged for human review; this
script never rewrites verified guide content.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services import loader, refresh  # noqa: E402


def main() -> int:
    services = {
        service_id: loader.get_service(service_id)
        for service_id in loader._SERVICES  # validated at import time
        if loader.is_enabled(service_id)
    }
    result = refresh.refresh_all(services)
    print(json.dumps({
        "checked_at": result["checked_at"],
        "next_check": result["next_check"],
        "services": {
            service_id: {
                "status": state["status"],
                "pending_review": state["pending_review"],
                "changed": len(state["changed_urls"]),
                "unreachable": len(state["unreachable_urls"]),
            }
            for service_id, state in result["services"].items()
        },
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
