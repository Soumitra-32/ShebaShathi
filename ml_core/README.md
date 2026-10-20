# Shared multilingual embedding provider

`ml_core/ml/embeddings` is the sole shared ML implementation. The FastAPI RAG
pipeline uses its SentenceTransformers provider for indexed documents and
queries. Chroma storage, retrieval, citation checks, and optional API-backed
answer generation are maintained in `backend/app/rag`.

The default `intfloat/multilingual-e5-small` model supports Bangla and English.
Its weights are downloaded from Hugging Face the first time an index is built
or queried, then cached by SentenceTransformers. The project does not include
or claim an operational local text-generation model. Without an optional
OpenAI-compatible API key, the copilot returns cited source excerpts.

Install the dependencies from `backend/requirements.txt`; this directory is
imported by the backend and does not contain a second RAG pipeline.
