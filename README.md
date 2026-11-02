# ShebaShathi BD

Bangla-first, source-grounded help for Bangladesh citizen identity and public services (e-Passport, birth registration, NID, driving licence, and death registration). This is an independent citizen tool, not a government service. It does not submit applications or store applicant data.

## Features

- **AI intake on the home page** (`/#intake`): describe a situation in Bangla, English or Banglish. The optional LLM acts only as a service/task classifier; a deterministic keyword router takes over when no key is configured, the provider fails, or its output is invalid. The UI states which mode was used, asks only for missing non-sensitive answers, and then builds a verified checklist. Identity-like numbers are rejected before any model call. The intake text is not stored; see `docs/PRIVACY.md`.
- Service directory with per-service, source-dated guides: e-Passport, birth registration, NID, driving licence, and death registration. Each task resolves to a documented official source; unknown cases get a safe fallback.
- Conditional preparation checklists driven by minimal, non-sensitive answers (age, yes/no, category). The API never accepts identity numbers, files, or credentials.
- Deterministic official e-Passport fee lookup and delivery estimates, with inclusive VAT breakdown and verification date. The canonical guide contains the estimator; `/wizard` redirects to it.
- Persistent Chroma retrieval using multilingual E5 embeddings, filtered by `service_id`; answers include source citations, verification dates, chunk IDs, and similarity scores.
- **Multi-turn grounded copilot** (`/copilot` and the floating assistant): deterministic fee/photo/status tools run first; everything else is answered only from service-scoped retrieved sources. The conversation is held in the browser, follow-ups keep the service context, and every generated answer is verified against the cited chunks before it is shown.
- **AI case brief** on a verified checklist: the model rewrites the deterministic checklist in plain Bangla or English. It cannot add a fee, document, deadline or rule, and an answer with an unsupported number is replaced by the deterministic summary.
- Optional OpenAI-compatible answer generation (OpenRouter, OpenAI, or any compatible endpoint). The default is `anthropic/claude-sonnet-4.6` with `LLM_MODEL_FALLBACKS` for resilience. With no `LLM_API_KEY`, the copilot shows a cited source excerpt. No local text-generation model is included.
- **Service-aware fee checker** (`/redflag`): choose the government service first, fill only the fields that apply to it, and compare the amount you were told with the official breakdown. The calculation runs in your browser; the claimed amount is never sent.
- **Complaint drafter** (`/grs`): the draft is written in your browser by deterministic templates, so no complaint text, date or office name is transmitted. It asks only for the details that are missing, marks unknown facts as placeholders, and can be edited, copied, printed and reset.
- **Local voice input** for the complaint description with a self-hosted Whisper model; recognised text stays editable and never leaves the device.
- **Browser-only document consistency check** (`/identity-check`): add document images or PDFs, read them locally (PDF text layer, or OCR for scans), confirm the extracted values, and compare only the fields you choose. Nothing is uploaded, stored or logged, and everything is cleared when the page is closed or reset.
- GRS complaint draft with copy and browser print-to-PDF; all submitted facts stay in the user's browser/request and are not stored.
- Fee comparison, with offline fallback to previously cached fee/checklist responses.
- **Application-status guide** (`/services/epassport/status`): plain-language, source-dated explanation of the official status strings (from the Special Branch FAQ), the official status-check steps, diaspora/mission guidance, and fraud warnings — plus a fraud-shield card on the e-Passport guide and a deterministic status answer inside the copilot. The guide never asks for an Application ID, date of birth or other identifier; every line cites its official source and verification date.
- **Built for AIgnite 2026 sticker** in the sticky navbar on every page and in the homepage hero, served from `frontend/public/` (a nav-sized JPEG plus the full-size PNG).

## Local setup

Requirements: Python 3.11+, Node.js 20+, npm. Copy `.env.example` to `.env` and adjust frontend CORS/API settings as needed. The embedding model downloads from Hugging Face on first indexing; provide network access then, or pre-cache the model.

Backend (from repo root):

```powershell
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt
$env:PYTHONPATH = "backend"
python -m app.rag.ingest --rebuild
uvicorn app.main:app --reload --app-dir backend --env-file .env
```

Frontend:

```powershell
cd frontend
npm ci                # also copies the local OCR/PDF/ONNX runtime into public/
npm run fetch-models  # one-time: Tesseract language data (ben, eng) + Whisper model
npm run dev
```

`npm run fetch-models` downloads the OCR language data and the Whisper model **once** into `frontend/public/` so the browser loads them from this project's own origin instead of a CDN. Without them the app still runs: the OCR and voice features explain that the local model is missing and the manual input paths stay available. Use `npm run fetch-models -- --model whisper-tiny` for the smaller model.

The backend warms Chroma and the embedding model during startup (set `WARM_RETRIEVAL=false` to skip it). On a cold machine startup can take tens of seconds; waiting for `/health` to report `ai_ready: true` avoids a slow first question.

Open `http://localhost:3000`. Backend API docs: `http://localhost:8000/docs`.

To run both services using Docker, create `.env` first, then run `docker compose up --build`. The backend image indexes the bundled corpus at startup and persists Chroma/model cache in named volumes. Initial model download may take several minutes.

## Refreshing verified sources and index

Official sources and verification dates are recorded in `data/VERIFICATION_LOG.md`. Update the snapshots under `corpus/` only after reviewing the official page, record the verification, then rebuild with `python -m app.rag.ingest --rebuild`. Every corpus file must carry a `service_id` in its front matter so retrieval stays scoped to one authority.

Service rules live in `data/services/`: `index.json` enables each service and `*.json` holds its validated contract (documents, tasks, conditional rules, steps, warnings, official links). The loader in `backend/app/services/loader.py` fails closed if a rule is missing a `service_id`, an `https` `source_url`, or a `last_verified` date. Fee/checklist data for the e-Passport wizard is still read from `data/fees.json` and `data/requirements.json`.

## Routes

- `/` — AI intake immediately after the hero, then the service tools.
- `/services`, `/services/[serviceId]`, `/services/[serviceId]/guide` — service directory, overview, and conditional checklist. The e-Passport guide also contains the canonical deterministic fee estimator (`#fee`) and the fraud-shield card.
- `/services/[serviceId]/status` — verified application-status guide (official status meanings, how to check, diaspora guidance, fraud warnings). Shown on the overview only when verified guidance exists.
- `/identity-check` — local document consistency comparison (no upload to any server, no storage).
- `/fees`, `/copilot`, `/redflag`, `/grs` — legacy e-Passport fee calculator, multi-turn grounded copilot, service-aware fee checker, and the browser-only GRS drafter.
- `/wizard` — permanent server redirect to `/services/epassport/guide#fee`; old links keep working.

## API

- `POST /api/intake` — map a short, non-sensitive situation description to one service/task. Returns the generation mode (`api`, `rules`, `confirmed`, or `blocked`), detected answers, missing questions, and options when the request is ambiguous. The optional `service_id`/`task_id` fields record a user confirmation and are validated against the service catalog.
- `GET /health` — includes `service_count`, `index_count`, `ai_ready`, and the configured provider/model (never the key).
- `GET /api/services`, `GET /api/services/{service_id}`, `POST /api/services/{service_id}/checklist` — catalog, guide content, and conditional checklist.
- `GET /api/services/{service_id}/status-guide` — validated status-guide content (status meanings, diaspora guidance, fraud warnings, freshness). Public and non-sensitive; `GUIDANCE_NOT_FOUND` when a service has none.
- `GET /api/fee-schedules` — public, non-sensitive catalog of verified fee schedules (labels, amounts, official source URLs, verification dates). The browser performs the calculation.
- `POST /api/copilot/ask` accepts an optional `service_id` to scope retrieval to one authority and pick that service's fallback string.
- `POST /api/copilot/chat` — multi-turn grounded chat. Accepts a question, up to six recent turns (browser-held) and an optional `service_id`; returns the answer, citations, service scope, grounded flag, generation mode, the model that answered, and suggested follow-ups. Identity-like numbers are rejected with `422 IDENTITY_DATA_REJECTED` before any model or embedding call.
- `POST /api/services/{service_id}/checklist/brief` — explains an already-generated verified checklist. Reuses the same checklist request shape; returns a plain-language brief plus source URL and verification date. Unsupported model facts fall back to the deterministic summary.
- Existing e-Passport endpoints (`/api/checklist`, `/api/fees/calculate`, `/api/redflag/check`, `/api/grs/draft`) are unchanged. The complaint page no longer calls `/api/grs/draft`, so complaint text stays in the browser; the endpoint remains for API callers.

## LLM provider (optional: copilot and intake routing)

The source-grounded copilot and the optional intake classifier can use any OpenAI-compatible chat-completions endpoint. **OpenRouter** is the default in `.env`:

```powershell
# .env
LLM_API_BASE=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-sonnet-4.6   # any OpenRouter model id
LLM_MODEL_FALLBACKS=google/gemini-2.5-flash,openai/gpt-4o-mini  # optional
LLM_API_KEY=sk-or-v1-...              # https://openrouter.ai/keys
LLM_APP_TITLE=ShebaShathi BD          # optional dashboard attribution
LLM_HTTP_REFERER=http://localhost:3000 # optional dashboard attribution
```

`LLM_MODEL_FALLBACKS` is a comma-separated list tried in order when the primary model is missing, rate-limited, unreachable, cannot afford the requested tokens, or returns an unusable answer. The response reports the model that actually answered.

How it behaves:

- **No key → no provider call.** The copilot answers with the cited source excerpt (`generation_mode: "extractive"`); intake uses the deterministic keyword router (`generation_mode: "rules"`).
- Intake uses the model only to choose a service/task and extract answers for questions the catalog already declares. Unknown services/tasks and out-of-range answers are discarded; fees, documents and rules always come from the validated data.
- OpenRouter is detected from the base URL; `HTTP-Referer` and `X-Title` are sent only to OpenRouter and only when configured.
- If a model does not support JSON mode, the request is retried once without `response_format` and a fenced JSON answer is still parsed.
- Provider errors (401 invalid key, 402 insufficient credit/tokens, 429 rate limit, 5xx) produce a safe message; the API key is never logged or echoed. If `LLM_MODEL_FALLBACKS` is set, availability and affordability errors are retried with the next model. Intake falls back to the deterministic router; the copilot and case brief fall back to cited/deterministic text.
- `GET /health` reports `llm_provider`, `llm_model`, `service_count`, `index_count` and `ai_ready` (never the key); the copilot shows which provider answered.
- The provider receives the copilot question plus retrieved source excerpts, or the intake description after the heuristic identity-number rejection. It never receives complaint text, document images, extracted document values or voice audio; those workflows stay local — see `docs/PRIVACY.md`.

Swap in OpenAI or any other compatible endpoint by changing `LLM_API_BASE` and `LLM_MODEL` only.

## Project documentation

- [Product scope and implementation roadmap](docs/PLANNER.md)
- [Security requirements and agent self-audit](docs/SECURITY_ASSESSMENT.md)
- [Privacy and local-processing map](docs/PRIVACY.md)
- [Production deployment steps (Render + Vercel)](docs/DEPLOYMENT.md)
- [3-minute demo script and backup-recording checklist](docs/DEMO_SCRIPT.md)
- [Local UX check notes](docs/UX_CHECKS.md)
- [Live evaluation evidence and limitations](docs/EVAL_RESULTS.md)
- [Security self-audit for the AI intake changes](docs/SECURITY_AUDIT_2026-10-23.md)
- [Security self-audit for the multi-turn copilot and AI brief](docs/SECURITY_AUDIT_2026-11-02.md)

## Validation

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest app/tests -q          # 150 passed on 2026-11-02
python -m compileall -q app
python scripts/live_eval.py            # live provider eval; requires configured LLM/retrieval
cd ..\frontend
npm test                               # 90 passed (10 files) on 2026-11-01
npx tsc --noEmit
npm run lint
npm run build
npm run verify:local                   # optional: OCR + PDF extraction on synthetic fixtures
npm run verify:speech                  # optional: the local Whisper model loads and runs
npm run verify:privacy                 # optional: headless Chrome check that no sensitive value is transmitted
npm run verify:intake                  # optional: headless Chrome UI check of intake, nav and fee estimator
```

`npm run verify:local` needs the synthetic fixtures (`python scripts/make_local_fixtures.py`) and exercises the same Tesseract build, language data and pdf.js library that the browser uses. `npm run verify:speech` loads the shipped Whisper model through the same pipeline the page uses. `npm run verify:privacy` drives the three sensitive workflows in headless Chrome over the DevTools protocol with the app running, and fails if a complaint text, a document, an extracted identity value or a claimed amount appears in a request, in `localStorage`/`sessionStorage`, or in the console. `npm run verify:intake` needs the backend on `http://localhost:8000` and the frontend on `http://localhost:3000`; it exercises success, PII rejection, unsafe-intent blocking, network failure, ambiguous choices, mobile menu/Escape, 375px overflow, the guide fee estimator, the fraud-shield card, and the status guide (meaning, official action, zero identity inputs, citations and helpline) — 27 checks, all passing on 2026-11-01. All three browser scripts need Chrome or Edge installed.

The measured live evaluation on 2026-10-23 answered **26/26** grounded questions with source-token coverage and refused **4/4** adversarial questions; see [docs/EVAL_RESULTS.md](docs/EVAL_RESULTS.md). This is a small, provider-dependent evaluation, not a claim of production accuracy. `backend/app/tests/test_eval_offline.py` mocks retrieval and the LLM, so it tests wiring and safety behavior, not live factual accuracy.

The frontend's PDF actions use the browser print dialog so the bundled Noto Sans Bengali font shapes Bangla text. Choose “Save as PDF”. The final output depends on the browser's print-to-PDF implementation.

## Limitations

- Source snapshots were manually checked and are not auto-refreshed; dates are displayed so users can verify changes. Review service rules on a cadence and after official notices, recording each change in `data/VERIFICATION_LOG.md`.
- The copilot only knows the small, checked-in source corpus. It returns the selected service's official-site fallback when retrieval/citation checks fail.
- The document consistency check compares text only; it does not decide which value is legally correct and does not authenticate any document or person. It also cannot read a document that is too unclear to scan; every extracted value is shown unconfirmed for review.
- Voice input uses a small local Whisper model. Bangla dictation is usable but not perfect, so the transcript is editable before it is used.
- The fee checker only shows amounts for services whose schedule was verified against an official page; the rest show "manual verification required" and a link to the official portal.
- Browser-local processing keeps this application from uploading your documents. It does not protect against a compromised device, a malicious browser extension, or malicious application code. See `docs/PRIVACY.md`.
- The AI intake is a starting point, not an official decision. It can misclassify an ambiguous sentence; the UI then asks the user to choose a service or task, and every checklist item still comes from the validated catalog. The keyword fallback covers common Bangla/English/Banglish phrases but not every wording.
- Identity-number rejection is shape-based and intentionally conservative. It can miss an unusual format; the UI tells users not to paste identity numbers, and the server never stores or logs the intake text. When an LLM key is configured, the provider receives the description after that heuristic check. See `docs/PRIVACY.md`.
- Rate limits for `/api/intake`, `/api/copilot/ask`, `/api/copilot/chat` and `/api/services/{id}/checklist/brief` are process-local. A multi-instance deployment needs a shared store (for example Redis); see `docs/DEPLOYMENT.md`.
- Generated chat and brief text can vary between runs even at low temperature. The verifier blocks unsupported numbers and URLs and falls back to cited or deterministic text, but it cannot prove that every paraphrase is ideal. Treat the cited source and the deterministic checklist as authoritative.
- No public deployment URL is included; see `docs/DEPLOYMENT.md` for the Render/Vercel steps. The latest full live eval result is recorded in `docs/EVAL_RESULTS.md`; the set is small and provider output can vary between runs.
