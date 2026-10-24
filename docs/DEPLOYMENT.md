# Deployment Guide (Render backend + Vercel frontend)

> Live deploy is intentionally NOT done in this repo: it needs your Render/Vercel
> accounts and production secrets. No deployment URL is claimed below (PLANNER §0
> rule 8 — never fabricate stats or URLs). Follow these steps to deploy.

## 1. Backend on Render (or Fly/Railway)

1. Push this repo to GitHub (no `.env` — only `.env.example` is committed).
2. Create a Render **Web Service** from the repo:
   - Build command: `pip install -r backend/requirements.txt`
   - Start command:
     `sh -c "python -m app.rag.ingest && uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend"`
   - Add a **persistent disk** (paid plan) mounted at `/var/data` so both the
     Chroma index and the embedding-model cache survive restarts. A free
     instance has no persistent disk: the start command still rebuilds the
     index, but every cold start pays the ingestion/model-download cost.
3. Environment variables (Render dashboard → Environment):
   - `PYTHONPATH=backend` (needed by the ingestion command from the repo root)
   - `CORS_ORIGINS=https://<your-frontend>.vercel.app` (exact origin; never `*` with credentials)
   - `CHROMA_PERSIST_DIR=/var/data/chroma`
   - `HF_HOME=/var/data/huggingface` (persist the embedding-model download)
   - `EMBEDDING_MODEL=intfloat/multilingual-e5-small`
   - `RAG_TOP_K=5`, `RAG_MIN_SCORE=0.35`
   - Abuse controls (optional): `RATE_LIMIT_ENABLED=true`,
     `RATE_LIMIT_PER_MINUTE=60`, `INTAKE_RATE_LIMIT_PER_MINUTE=60`
   - Optional LLM provider (copilot answers and intake classification). For OpenRouter:
     `LLM_API_BASE=https://openrouter.ai/api/v1`, `LLM_MODEL=openai/gpt-4o-mini`
     (or another OpenRouter model id), `LLM_API_KEY=<your key>`,
     and optionally `LLM_APP_TITLE=ShebaShathi BD` and `LLM_HTTP_REFERER=<your site url>`
     for OpenRouter dashboard attribution. Leave `LLM_API_KEY` unset to keep
     the copilot in cited extractive mode and intake in deterministic keyword
     mode, with no external model call at all.
4. The start command runs `python -m app.rag.ingest` before uvicorn. Ingestion
   builds the index only when the volume is empty or the index version changes;
   it does not rebuild on every boot. The first boot therefore downloads the
   embedding model and builds all chunks, which can take several minutes.
   `GET /health` must report `index_count > 0` and `ai_ready: true` before the
   AI intake can retrieve sources. `service_count` should be 5. Verify
   `GET /api/services` and a real `POST /api/intake` request as well.
5. Rate limiting is process-local. If you run more than one backend instance,
   the per-client limit is not shared, and behind a proxy the recorded client
   key may be the proxy address. Use one instance, or replace
   `backend/app/rate_limit.py` with a shared store (for example Redis) and
   review the proxy-header trust decision before scaling out.

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

- HTTPS only; production `CORS_ORIGINS` contains only the Vercel domain (no wildcard with credentials).
- `DEBUG=false`; no reload/debug servers in production.
- Chroma/model volumes are private (never under a static/public dir) and the disk is mounted at `/var/data`.
- `/health` reports `index_count > 0`, `ai_ready: true`, and `service_count: 5`.
- A real intake request, a PII-rejection request, and an unsafe-intent request behave as documented; the backend log contains no request body text.
- `LLM_API_KEY` is set only in the host secret store; it is never in the client bundle, repo, or logs.
- The CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  and `X-Frame-Options` headers are present on every route.
- `docker compose up --build` still runs cleanly locally as the fallback demo.
- If you scale beyond one instance, replace the process-local rate limiter before launch; see §1.5.

## 4. What is NOT included

- No live URL, no Lighthouse run (§13.3), no backup demo video (§15): those need
  a deployed environment and a recorded run, which only you can produce. See
  `docs/DEMO_SCRIPT.md` for the 3-minute script and recording checklist.
