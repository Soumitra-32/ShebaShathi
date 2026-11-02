"""Measure RSS of the production ONNX (no-torch) runtime path.

Spawns a child process that imports the FastAPI app, opens the prebuilt ONNX
index, embeds and retrieves a real question (mirroring one ``/api/copilot/ask``
call), then reports the child's peak and final RSS. This is the number that
must fit inside Render free's 512 MB / container limit.

Usage:
    python backend/scripts/measure_onnx_memory.py \
        [--index .tmp-test/eval-parity/chroma-onnx]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

CHILD_CODE = r"""
import json
import sys
import threading
import time
sys.path.insert(0, sys.argv[1])
import psutil

handle = psutil.Process()
peak = {"rss": 0}

def sampler():
    while not stop.is_set():
        peak["rss"] = max(peak["rss"], handle.memory_info().rss)
        time.sleep(0.01)

stop = threading.Event()
threading.Thread(target=sampler, daemon=True).start()

from app.config import settings
from app.rag import retriever
from app.main import app  # full import, as uvicorn would
assert settings.embedding_backend == "onnx" and settings.vector_store == "numpy"
collection = retriever._collection()
assert type(collection).__name__ == "NumpyStore", type(collection).__name__
retriever._embedder()          # load the ONNX session
docs = retriever.retrieve("How much is the express fee for a 10-year passport?", top_k=5)
# touch a couple of production paths that load data services
from app.services import loader
loader.list_services()
stop.set()
time.sleep(0.05)
result = {
    "retrieved": len(docs),
    "services": len(loader.list_services()),
    "peak_rss_mb": round(peak["rss"] / (1024 * 1024), 1),
    "final_rss_mb": round(handle.memory_info().rss / (1024 * 1024), 1),
}
print("@@RESULT@@" + json.dumps(result))
"""

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--index",
        default=str(ROOT / ".tmp-test" / "eval-parity" / "chroma-onnx"),
        help="prebuilt ONNX Chroma index directory",
    )
    args = parser.parse_args()

    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "backend")
    env["EMBEDDING_BACKEND"] = "onnx"
    env["ONNX_MODEL_DIR"] = str(ROOT / "backend" / "models" / "e5-small-onnx")
    env["CHROMA_PERSIST_DIR"] = args.index
    env["VECTOR_STORE"] = "numpy"

    process = subprocess.run(
        [sys.executable, "-c", CHILD_CODE, str(ROOT / "backend")],
        capture_output=True, env=env,
    )
    print(f"child exit code      : {process.returncode}")
    result_line = next(
        (line for line in process.stdout.decode(errors="replace").splitlines()
         if line.startswith("@@RESULT@@")),
        None,
    )
    if not result_line:
        print("child stderr (first 1500 chars):")
        print(process.stderr.decode(errors="replace")[:1500])
        return 1
    # the sampler reads the parent's console output only through stdout; parse
    payload = json.loads(result_line.removeprefix("@@RESULT@@"))
    print(f"work done            : retrieved={payload['retrieved']} services={payload['services']}")
    print(f"peak RSS sampled     : {payload['peak_rss_mb']} MB")
    print(f"final RSS            : {payload['final_rss_mb']} MB")
    verdict = "FITS" if payload["peak_rss_mb"] < 480 else "AT RISK"
    headroom = round(512 - payload["peak_rss_mb"], 1)
    print(f"Render free limit    : 512 MB -> {verdict} (headroom {headroom} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
