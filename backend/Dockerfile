# Low-memory production image (Render free plan: 0.1 CPU / 512 MB).
# No PyTorch: the RAG embedder is multilingual-e5-small via ONNX Runtime,
# the Chroma index is built into the image, and nothing is downloaded or
# ingested at boot (a free instance has no persistent disk and 0.1 CPU).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false MALLOC_ARENA_MAX=2 \
    PYTHONPATH=/app/backend \
    CHROMA_PERSIST_DIR=/app/.chroma \
    EMBEDDING_BACKEND=onnx \
    VECTOR_STORE=numpy \
    ONNX_MODEL_DIR=/app/models/e5-small-onnx

WORKDIR /app

COPY backend/requirements-render.txt /app/backend/requirements-render.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-render.txt

COPY backend/scripts/fetch_onnx_model.py /app/backend/scripts/fetch_onnx_model.py
RUN python /app/backend/scripts/fetch_onnx_model.py

COPY backend/app /app/backend/app
COPY ml_core /app/ml_core
COPY data /app/data
COPY corpus /app/corpus

# Build the index once at image build time. `python -m app.rag.ingest` is a
# no-op when the index already exists and matches INDEX_VERSION; here it
# fills the empty image path. After editing corpus or service data, rebuild
# the image (no runtime ingestion happens on a 512 MB free instance).
RUN python -m app.rag.ingest

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
