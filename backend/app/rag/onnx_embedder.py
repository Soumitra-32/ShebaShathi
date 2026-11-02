"""ONNX Runtime embedder for multilingual E5 — the low-memory production path.

The RAG model (``intfloat/multilingual-e5-small``) is unchanged; only the
runtime differs. sentence-transformers needs PyTorch, whose footprint
(weights ~470 MB plus the runtime) does not fit a 512 MB free-tier container.
The same model exported to ONNX and quantised to int8 (~118 MB) produces
embeddings of the same dimension with the required ``query:``/``passage:``
prefixes.

The ONNX artefacts come from the ``Xenova/multilingual-e5-small`` export of
the same base model (see ``backend/scripts/fetch_onnx_model.py``).

ml_core keeps its sentence-transformers embedder for local development and
evaluation; this module only replaces the runtime inside small containers.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path

import numpy as np

from ..config import settings

logger = logging.getLogger(__name__)

E5_PREFIX_QUERY = "query: "
E5_PREFIX_PASSAGE = "passage: "

_lock = threading.Lock()
_session_cache: dict[tuple[str, int, int], "OnnxEmbedder"] = {}


class OnnxEmbedder:
    """Singleton ONNX embedder matching ml_core's LocalEmbedder API."""

    def __init__(self, model_dir: str | Path | None = None, threads: int | None = None):
        model_dir = Path(model_dir or settings.onnx_model_dir)
        threads = threads if threads is not None else settings.onnx_threads
        self.model_dir = model_dir
        self.threads = threads
        self._session, self._input_names, self._tokenizer = self._load(model_dir, threads)

    # -- loading ---------------------------------------------------------
    @staticmethod
    def _load(model_dir: Path, threads: int):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        model_path = model_dir / "model.onnx"
        tokenizer_path = model_dir / "tokenizer.json"
        if not model_path.exists() or not tokenizer_path.exists():
            raise RuntimeError(
                "ONNX embedding model is missing. Run "
                "`python backend/scripts/fetch_onnx_model.py` or set ONNX_MODEL_DIR."
            )

        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, int(threads))
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        # Small containers: trade a little speed for a large RAM saving.
        options.enable_cpu_mem_arena = False
        options.enable_mem_pattern = False

        session = ort.InferenceSession(
            str(model_path), sess_options=options, providers=["CPUExecutionProvider"]
        )
        # Feed exactly the inputs the graph declares; some exports require
        # token_type_ids even though E5 (XLM-R) does not use them.
        input_names = {item.name for item in session.get_inputs()}
        tokenizer = Tokenizer.from_file(str(tokenizer_path))
        # E5 truncates at 512 tokens (ml_core uses the same limit). Padding
        # pads each batch to its own longest sequence, which keeps short
        # queries cheap; the attention mask handles the padding tokens.
        tokenizer.enable_truncation(max_length=512)
        tokenizer.enable_padding()
        return session, input_names, tokenizer

    # -- API ----------------------------------------------------------------
    def embed(self, texts: list[str], batch_size: int | None = None, task: str = "passage") -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        prefix = E5_PREFIX_QUERY if task == "query" else E5_PREFIX_PASSAGE
        encodings = self._tokenizer.encode_batch([prefix + text for text in texts])
        input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
        feed: dict[str, np.ndarray] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }
        if "token_type_ids" in self._input_names:
            feed["token_type_ids"] = np.zeros_like(input_ids)

        outputs = self._session.run(None, feed)
        hidden = outputs[0].astype(np.float32)
        mask = attention_mask[:, :, None].astype(np.float32)
        summed = (hidden * mask).sum(axis=1)
        counts = np.clip(mask.sum(axis=1), 1e-9, None)
        mean_pooled = summed / counts
        norm = np.clip(np.linalg.norm(mean_pooled, axis=1, keepdims=True), 1e-12, None)
        return (mean_pooled / norm).astype(np.float32)

    def embed_single(self, text: str) -> np.ndarray:
        return self.embed([text], task="query")[0]

    def embed_query(self, text: str) -> np.ndarray:
        return self.embed([text], task="query")[0]

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        return self.embed(texts, task="passage")

    @property
    def dim(self) -> int:
        return int(self._session.get_outputs()[0].shape[-1])

    def is_ready(self) -> bool:
        return self._session is not None

    @classmethod
    def get_instance(
        cls, model_dir: str | Path | None = None, threads: int | None = None
    ) -> "OnnxEmbedder":
        resolved_threads = int(threads if threads is not None else settings.onnx_threads)
        key = (str(model_dir or settings.onnx_model_dir), resolved_threads)
        with _lock:
            instance = _session_cache.get(key)
            if instance is None:
                instance = cls(model_dir=key[0], threads=key[1])
                _session_cache[key] = instance
            return instance

    @classmethod
    def reset(cls) -> None:
        with _lock:
            _session_cache.clear()
