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
   - Optional LLM provider (copilot only). For OpenRouter:
     `LLM_API_BASE=https://openrouter.ai/api/v1`, `LLM_MODEL=openai/gpt-4o-mini`
     (or another OpenRouter model id), `LLM_API_KEY=<your key>`,
     and optionally `LLM_APP_TITLE=ShebaShathi BD` and `LLM_HTTP_REFERER=<your site url>`
     for OpenRouter dashboard attribution. Leave `LLM_API_KEY` unset to keep
     the copilot in cited extractive mode with no external call at all.
4. First boot rebuilds the index automatically in Docker (`docker-compose.yml`
   runs `python -m app.rag.ingest --rebuild`); on Render the `.chroma` disk
   keeps it. Verify with `GET /health` and `GET /api/services`.

## 2. Frontend on Vercel

1. Import the repo in Vercel, root directory `frontend/`.
2. Build: `npm ci && npm run build`. Start: `npm run start`.
   `npm ci` also runs the postinstall step that copies the local OCR, PDF and
   ONNX runtime into `frontend/public/`.
3. Environment variable: `NEXT_PUBLIC_API_URL=https://<your-backend>.onrender.com`.
4. Redeploy after changing the backend URL. Verify `/services` loads without
   `offline_fallback`.
5. **Local OCR and voice input** need the model files in `frontend/public/`
   (`npm run fetch-models`, ~74 MB). Run it before the build, or upload
   `frontend/public/models/` and `frontend/public/tessdata/` to the deployment
   by other means. Without them the app still works: the OCR and microphone
   features explain that the local model is missing and the manual input paths
   stay available. The models are served from your own domain, so no
   third-party host ever sees a user's document.
6. The security headers are set in `frontend/next.config.js` and are applied by
   `next start` as well as by Vercel. Keep `NEXT_PUBLIC_API_URL` accurate: the
   CSP allows only that origin for `connect-src`.

## 3. Production checklist (PLANNER §13.3 / SECURITY §3.5)

- HTTPS only; production `CORS_ORIGINS` contains only the Vercel domain.
- `DEBUG=false`; no reload/debug servers in production.
- Chroma/model volumes are private (never under a static/public dir).
- The CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  and `X-Frame-Options` headers are present on every route.
- `docker compose up --build` still runs cleanly locally as the fallback demo.

## 4. What is NOT included

- No live URL, no Lighthouse run (§13.3), no backup demo video (§15): those need
  a deployed environment and a recorded run, which only you can produce. See
  `docs/DEMO_SCRIPT.md` for the 3-minute script and recording checklist.
