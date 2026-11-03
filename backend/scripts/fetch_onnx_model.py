"""Download the ONNX export of multilingual-e5-small for low-memory serving.

Downloads the int8 ONNX model and the standalone fast tokenizer from the
``Xenova/multilingual-e5-small`` export of the same base model used by
ml_core (``intfloat/multilingual-e5-small``). Public repository; no token is
needed and none is stored.

The target defaults to ``ONNX_MODEL_DIR`` when that variable is set (the same
setting the embedder reads), otherwise ``backend/models/e5-small-onnx``.

Usage:
    python backend/scripts/fetch_onnx_model.py            # into $ONNX_MODEL_DIR
    python backend/scripts/fetch_onnx_model.py --dir D:/x # custom target
    python backend/scripts/fetch_onnx_model.py --check    # verify only, no download
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ID = "Xenova/multilingual-e5-small"
# Dynamic-quantised int8 export of the same base model. ``model_quantized.onnx``
# is kept as a fallback: same TensorRT-free quantisation, committed earlier.
MODEL_CANDIDATES = ["onnx/model_int8.onnx", "onnx/model_quantized.onnx"]
SUPPORT_FILES = ["tokenizer.json", "config.json", "special_tokens_map.json"]
MIN_MODEL_BYTES = 100 * 1024 * 1024  # int8 export is ~118 MB

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "models" / "e5-small-onnx"


def default_target(environ: dict[str, str] | None = None) -> Path:
    """Directory the runtime will read, so the download lands where it is used.

    ``ONNX_MODEL_DIR`` wins (the Dockerfile sets it to ``/app/models/...``);
    unset falls back to the local development path.
    """
    environ = os.environ if environ is None else environ
    configured = environ.get("ONNX_MODEL_DIR", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_DIR


def check(directory: Path) -> int:
    missing = [name for name in ["model.onnx", "tokenizer.json"] if not (directory / name).exists()]
    model_path = directory / "model.onnx"
    if model_path.exists() and model_path.stat().st_size < MIN_MODEL_BYTES:
        missing.append("model.onnx (truncated download)")
    if missing:
        print(f"INCOMPLETE: missing in {directory}: {', '.join(missing)}")
        return 1
    print(f"OK: {directory} contains a complete ONNX embedder.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", default=None, help="target directory (default: $ONNX_MODEL_DIR or backend/models/e5-small-onnx)")
    parser.add_argument("--check", action="store_true", help="verify the files only")
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    args = parser.parse_args()
    target = Path(args.dir).expanduser() if args.dir else default_target()

    if args.check:
        return check(target)

    if not args.force and check(target) == 0:
        print("Model already present; nothing to do.")
        return 0

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("huggingface-hub is required: pip install huggingface-hub")
        return 1

    target.mkdir(parents=True, exist_ok=True)
    downloaded = {}
    model_local_name = "model.onnx"
    for candidate in MODEL_CANDIDATES:
        try:
            path = hf_hub_download(repo_id=REPO_ID, filename=candidate)
            downloaded[model_local_name] = Path(path)
            break
        except Exception as error:  # noqa: BLE001 — try the next export
            print(f"Could not fetch {candidate}: {error}")
    if model_local_name not in downloaded:
        print("No ONNX model export could be downloaded.")
        return 1
    for name in SUPPORT_FILES:
        downloaded[Path(name).name] = Path(
            hf_hub_download(repo_id=REPO_ID, filename=name)
        )

    import shutil

    for local_name, source in downloaded.items():
        destination = target / local_name
        shutil.copyfile(source, destination)
        size_mb = destination.stat().st_size / (1024 * 1024)
        print(f"Copied {local_name} ({size_mb:.1f} MB)")

    return check(target)


if __name__ == "__main__":
    sys.exit(main())
