FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/app /app/backend/app
COPY ml_core /app/ml_core
COPY data /app/data
COPY corpus /app/corpus
ENV PYTHONPATH=/app/backend
EXPOSE 8000
CMD ["sh", "-c", "python -m app.rag.ingest --rebuild && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
