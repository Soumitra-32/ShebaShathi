# Deployment Guide (Render backend + Vercel frontend)

> Live deploy is intentionally NOT done in this repo: it needs your Render/Vercel
> accounts and production secrets. No deployment URL is claimed below (PLANNER §0
> rule 8 — never fabricate stats or URLs). Follow these steps to deploy.

## 0. What the production backend actually runs (and why)

Render's Free compute plan is **0.1 CPU / 512 MB RAM**, has **no persistent
disk**, and sleeps after 15 idle minutes (about a minute to wake). PyTorch plus
the fp32 e5-small weights need roughly 1 GB, so production runs the same
`intfloat/multilingual-e5-small` model through **ONNX Runtime int8** instead:

- `backend/requirements-render.txt` installs **no torch** (see
  `backend/requirements-dev.txt` for the local/dev equivalents).
- `backend/Dockerfile` downloads `Xenova/multilingual-e5-small` (int8 ONNX,
  ~118 MB) and builds the Chroma index **inside the image**; the runtime then
  serves retrieval from the exported `index.npz` (`VECTOR_STORE=numpy`)
  without importing chromadb or torch at request time.
- Measured local peak RSS for a full request path (app import, ONNX embedder,
  retrieval): **451 MB with 61 MB of headroom** under the 512 MB cap
  (`python backend/scripts/measure_onnx_memory.py`).
- Eval parity (30 questions, `backend/scripts/eval_onnx_vs_torch.py`):
  identical `must_contain` coverage 26/30 on both backends; ONNX's int8 noise
  changes some top-1 chunk picks but no question gained or lost a grounded
  answer. `RAG_MIN_SCORE` stays 0.35; measured ONNX top-1 scores ≥ 0.82.
- ml_core is untouched: the ONNX path is selected through
  `EMBEDDING_BACKEND=onnx` in `backend/app/rag/retriever.py`.

## 1. Backend on Render (free plan)

1. Push this repo to GitHub (no `.env` — only `.env.example` is committed).
2. Either create a Render **Web Service** from the repo
   (Runtime: Docker, Dockerfile path: `backend/Dockerfile`, build context: repo
   root, plan: Free, health check path: `/health`) or use "New → Blueprint"
   which reads the committed `render.yaml`.
   The start command is `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   (the image CMD); there is **no runtime ingestion**.
3. Environment variables (Render dashboard → Environment):
   - `CORS_ORIGINS=https://<your-frontend>.vercel.app` (exact origin; never
     `*` with credentials). Add `http://localhost:3000` also if you test
     against the live backend from a local frontend.
   - `EMBEDDING_BACKEND=onnx`, `VECTOR_STORE=numpy`,
     `CHROMA_PERSIST_DIR=/app/.chroma`, `ONNX_MODEL_DIR=/app/models/e5-small-onnx`,
     `PYTHONPATH=/app/backend` (all are baked into the Dockerfile too, so they
     only need touching if you change them).
   - Abuse controls (optional): `RATE_LIMIT_ENABLED=true`,
     `RATE_LIMIT_PER_MINUTE=60`, `INTAKE_RATE_LIMIT_PER_MINUTE=60`
   - Optional LLM provider (copilot answers and intake classification). For OpenRouter:
     `LLM_API_BASE=https://openrouter.ai/api/v1`, `LLM_MODEL=openai/gpt-4o-mini`
     (or another OpenRouter model id), `LLM_API_KEY=<key you have ROTATED>`,
     and optionally `LLM_APP_TITLE=ShebaShathi BD` and `LLM_HTTP_REFERER=<your site url>`
     for OpenRouter dashboard attribution. Leave `LLM_API_KEY` unset to keep
     the copilot in cited extractive mode and intake in deterministic keyword
     mode, with no external model call at all.
4. Docker build notes:
   - The image build runs `python -m app.rag.ingest` with the ONNX embedder
     (about a minute on the free build pipeline) and bakes the index into
     `/app/.chroma`. After editing `corpus/` or `data/services`, rebuild the
     image — data changes never reach a running free service another way.
   - `fetch_onnx_model.py` writes to `ONNX_MODEL_DIR` (the same variable the
     embedder reads), so the downloaded model and the runtime path cannot
     drift. The Dockerfile re-runs the script with `--check` before ingest;
     if the path is ever wrong, the build fails with `INCOMPLETE: ...` instead
     of failing at startup.
   - If you have a paid plan instead, keep the baked index on boot (the ingest
     module is a no-op when the index version matches) and revisit `VECTOR_STORE`.
5. Free-plan behaviour to expect (document it for the judges, never pretend it
   away):
   - Sleeps after 15 idle minutes; ~60 s to wake. The frontend pings
     `/health` on page load (`warmupBackend()` in `frontend/lib/api.ts`) and
     shows a "server is waking up" note when a request takes >6 s.
   - 750 free instance hours per workspace per calendar month. One sleeping
     service uses far less than that; two always-on free services share the
     same pool and can exhaust it.
   - Without a payment method on file, exceeding a quota suspends the service
     until the next month instead of charging anything.
   - The filesystem is ephemeral: nothing is written at runtime that must
     survive restarts (`VECTOR_STORE=numpy` serves read-only).
6. Verify after the first deploy:
   - `GET /health` → `index_count > 0`, `ai_ready: true`, `service_count: 6`.
   - `GET /api/services` lists all six services.
   - `GET /api/services/refresh-status` returns `pending_review: false` for the latest checked sources.
   - A real `POST /api/intake`, a PII-rejection request, and an
     unsafe-intent request behave as documented.
   - Rate limiting is process-local: run exactly ONE free instance (Render
     free is a single instance by design). If you ever scale out, replace
     `backend/app/rate_limit.py` with a shared store and re-review proxy
     header trust before launch.

## 2. Frontend on Vercel (free, Hobby)

1. Import the repo in Vercel, root directory `frontend/`.
2. Build: `npm ci && npm run build`. Start: `npm run start`.
   `npm ci` runs the postinstall step that copies the local OCR, PDF and ONNX
   runtime into `frontend/public/`. The `build` script itself now runs
   `fetch-models --soft` first, so a default Vercel build downloads the local
   OCR and voice models automatically; a download failure only warns and never
   breaks the deployment.
3. Environment variable (set BEFORE the first build; the CSP bakes it in):
   `NEXT_PUBLIC_API_URL=https://<your-backend>.onrender.com`.
4. Redeploy after changing the backend URL. Verify `/services` loads without
   `offline_fallback`.
5. **Local OCR and voice input** need the model files in `frontend/public/`
   (~74 MB). A standard `npm run build` fetches any that are missing
   automatically. To force-manage them, run `npm run fetch-models` before the
   build, or upload `frontend/public/models/` and `frontend/public/tessdata/`
   to the deployment by other means. Without them the app still works: the OCR
   and microphone features explain that the local model is missing and the
   manual input paths stay available. The models are served from your own
   domain, so no third-party host ever sees a user's document.
6. The security headers are set in `frontend/next.config.js` and are applied by
   `next start` as well as by Vercel. Keep `NEXT_PUBLIC_API_URL` accurate: the
   CSP allows only that origin for `connect-src`.
7. Set `CORS_ORIGINS` on Render to the final Vercel production URL once it
   exists, then redeploy the backend (a restart is enough).

## 3. Production checklist (PLANNER §13.3 / SECURITY §3.5)

- HTTPS only; production `CORS_ORIGINS` contains only the Vercel domain (no wildcard with credentials).
- `DEBUG=false`; no reload/debug servers in production.
- The Chroma/index directory is baked into the image (never under a static/public dir); on paid plans it would be a private volume.
- `/health` reports `index_count > 0`, `ai_ready: true`, and `service_count: 6`.
- A real intake request, a PII-rejection request, and an unsafe-intent request behave as documented; the backend log contains no request body text.
- `LLM_API_KEY` is set only in the host secret store; it is never in the client bundle, repo, or logs.
- The CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  and `X-Frame-Options` headers are present on every route.
- `docker compose up --build` still runs cleanly locally as the fallback demo
  (compose uses the dev requirements and can serve `EMBEDDING_BACKEND=torch`).
- If you scale beyond one instance, replace the process-local rate limiter before launch; see §1.5.

## 4. Local checks before deploying

```
# backend, from the repo root
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
$env:PYTHONPATH="backend"
python backend/scripts/fetch_onnx_model.py     # once, ~118 MB
python backend/scripts/eval_onnx_vs_torch.py   # retrieval parity report
python backend/scripts/measure_onnx_memory.py  # must report FITS
pytest backend/app/tests -q

# frontend (frontend/)
npm ci; npm run fetch-models
npm run lint; npx tsc --noEmit; npm test; npm run build
```

## 5. What is NOT included

- No live URL, no Lighthouse run (§13.3), no backup demo video (§15): those need
  a deployed environment and a recorded run, which only you can produce. See
  `docs/DEMO_SCRIPT.md` for the 3-minute script and recording checklist.
