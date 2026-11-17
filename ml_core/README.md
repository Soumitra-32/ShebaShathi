# Shared multilingual ML core

`ml_core/ml/embeddings` is the sole shared ML implementation. The FastAPI RAG
pipeline uses its SentenceTransformers provider for indexed documents and
queries. Chroma storage, retrieval, citation checks, and optional API-backed
answer generation are maintained in `backend/app/rag`.

The default `intfloat/multilingual-e5-small` model supports Bangla and English.
Its weights are downloaded from Hugging Face the first time an index is built
or queried, then cached by SentenceTransformers. The project does not include
or claim an operational local text-generation model. Without an optional
OpenAI-compatible API key, the copilot returns cited source excerpts.

## Runtime behaviour

- `LocalEmbedder` applies the E5 `query:` / `passage:` prefix exactly once,
  even when a caller passes an already-prefixed string.
- Repeated query embeddings are cached in a bounded LRU
  (`ML_EMBEDDING_CACHE_SIZE`, default `512`). Cache keys are SHA-256 digests, so
  the raw question is not retained; passages and indexing batches are not
  cached. The backend also bypasses the cache when a question looks sensitive.
- Duplicate strings in one batch are encoded once and mapped back.
- `IntentClassifier` uses `passage:` embeddings for its section prototypes and
  embeds all examples in one batch.
- `RAGPipeline` classifies each question once and fetches a wider candidate set
  before optional cross-encoder reranking.

The production image uses the separate ONNX implementation in
`backend/app/rag/onnx_embedder.py`; it mirrors the same prefix guard, query
cache and batch deduplication.

Install the dependencies from `backend/requirements.txt`; this directory is
imported by the backend and does not contain a second RAG pipeline.
