# Deployment Guide (Render backend + Vercel frontend)

> Live deploy is intentionally NOT done in this repo: it needs your Render/Vercel
> accounts and production secrets. No deployment URL is claimed below (PLANNER §0
> rule 8 — never fabricate stats or URLs). Follow these steps to deploy.

## 1. Backend on Render (or Fly/Railway)

1. Push this repo to GitHub (no `.env` — only `.env.example` is committed).
2. Create a Render **Web Service** from the repo:
   - Build command: `pip install -r backend/requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend`
   - Disk (persistent): mount at `/app/.chroma` so the Chroma index survives restarts.
   - Disk (cache): mount model cache (`/root/.cache/huggingface`) so the first
     embedding-model download is not repeated on every deploy.
3. Environment variables (Render dashboard → Environment):
   - `CORS_ORIGINS=https://<your-frontend>.vercel.app`
   - `CHROMA_PERSIST_DIR=/app/.chroma`
   - `EMBEDDING_MODEL=intfloat/multilingual-e5-small`
   - `RAG_TOP_K=5`, `RAG_MIN_SCORE=0.35`
   - Optional: `LLM_MODEL`, `LLM_API_BASE`, `LLM_API_KEY` (leave unset for
     extractive-only RAG).
4. First boot rebuilds the index automatically in Docker (`docker-compose.yml`
   runs `python -m app.rag.ingest --rebuild`); on Render the `.chroma` disk
   keeps it. Verify with `GET /health` and `GET /api/services`.

## 2. Frontend on Vercel

1. Import the repo in Vercel, root directory `frontend/`.
2. Build: `npm ci && npm run build`. Start: `npm run start`.
3. Environment variable: `NEXT_PUBLIC_API_URL=https://<your-backend>.onrender.com`.
4. Redeploy after changing the backend URL. Verify `/services` loads without
   `offline_fallback`.

## 3. Production checklist (PLANNER §13.3 / SECURITY §3.5)

- HTTPS only; production `CORS_ORIGINS` contains only the Vercel domain.
- `DEBUG=false`; no reload/debug servers in production.
- Chroma/model volumes are private (never under a static/public dir).
- `docker compose up --build` still runs cleanly locally as the fallback demo.

## 4. What is NOT included

- No live URL, no Lighthouse run (§13.3), no backup demo video (§15): those need
  a deployed environment and a recorded run, which only you can produce. See
  `docs/DEMO_SCRIPT.md` for the 3-minute script and recording checklist.
