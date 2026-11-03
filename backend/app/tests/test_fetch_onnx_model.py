"""Regression test for the ONNX model path used by the Docker build.

The Dockerfile sets ``ONNX_MODEL_DIR`` and then runs the fetch script. If the
script keeps its own hard-coded default, the model lands somewhere the runtime
never reads and ``python -m app.rag.ingest`` fails the image build (observed on
Render, 2026-11-03). The download target and the embedder must agree.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "fetch_onnx_model.py"
_spec = importlib.util.spec_from_file_location("fetch_onnx_model", SCRIPT)
assert _spec is not None and _spec.loader is not None
fetch_onnx_model = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fetch_onnx_model)


def test_default_target_uses_onnx_model_dir(tmp_path):
    target = fetch_onnx_model.default_target({"ONNX_MODEL_DIR": str(tmp_path)})
    assert target == tmp_path


def test_default_target_expands_user(monkeypatch):
    monkeypatch.setenv("HOME", "C:/Users/example")
    target = fetch_onnx_model.default_target({"ONNX_MODEL_DIR": "~/models/e5"})
    assert "~" not in str(target)


def test_default_target_falls_back_to_backend_models(monkeypatch):
    monkeypatch.delenv("ONNX_MODEL_DIR", raising=False)
    assert fetch_onnx_model.default_target({}) == fetch_onnx_model.DEFAULT_DIR
    assert fetch_onnx_model.default_target({}) == (
        fetch_onnx_model.ROOT / "models" / "e5-small-onnx"
    )


def test_blank_onnx_model_dir_is_ignored():
    assert fetch_onnx_model.default_target({"ONNX_MODEL_DIR": "   "}) == (
        fetch_onnx_model.DEFAULT_DIR
    )
