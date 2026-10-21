# ShebaShathi BD

Bangla-first, source-grounded help for Bangladesh citizen identity and public services (e-Passport, birth registration, NID, driving licence, and death registration). This is an independent citizen tool, not a government service. It does not submit applications or store applicant data.

## Features

- Service directory with per-service, source-dated guides: e-Passport, birth registration, NID, driving licence, and death registration. Each task resolves to a documented official source; unknown cases get a safe fallback.
- Conditional preparation checklists driven by minimal, non-sensitive answers (age, yes/no, category). The API never accepts identity numbers, files, or credentials.
- Deterministic official e-Passport fee lookup and delivery estimates, with inclusive VAT breakdown and verification date.
- Persistent Chroma retrieval using multilingual E5 embeddings, filtered by `service_id`; answers include source citations, verification dates, chunk IDs, and similarity scores.
- Optional OpenAI-compatible answer generation (OpenRouter, OpenAI, or any compatible endpoint). With no `LLM_API_KEY`, the copilot shows a cited source excerpt. No local text-generation model is included.
- **Service-aware fee checker** (`/redflag`): choose the government service first, fill only the fields that apply to it, and compare the amount you were told with the official breakdown. The calculation runs in your browser; the claimed amount is never sent.
- **Complaint drafter** (`/grs`): the draft is written in your browser by deterministic templates, so no complaint text, date or office name is transmitted. It asks only for the details that are missing, marks unknown facts as placeholders, and can be edited, copied, printed and reset.
- **Local voice input** for the complaint description with a self-hosted Whisper model; recognised text stays editable and never leaves the device.
- **Browser-only document consistency check** (`/identity-check`): add document images or PDFs, read them locally (PDF text layer, or OCR for scans), confirm the extracted values, and compare only the fields you choose. Nothing is uploaded, stored or logged, and everything is cleared when the page is closed or reset.
- GRS complaint draft with copy and browser print-to-PDF; all submitted facts stay in the user's browser/request and are not stored.
- Fee comparison, with offline fallback to previously cached fee/checklist responses.

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

Open `http://localhost:3000`. Backend API docs: `http://localhost:8000/docs`.

To run both services using Docker, create `.env` first, then run `docker compose up --build`. The backend image indexes the bundled corpus at startup and persists Chroma/model cache in named volumes. Initial model download may take several minutes.

## Refreshing verified sources and index

Official sources and verification dates are recorded in `data/VERIFICATION_LOG.md`. Update the snapshots under `corpus/` only after reviewing the official page, record the verification, then rebuild with `python -m app.rag.ingest --rebuild`. Every corpus file must carry a `service_id` in its front matter so retrieval stays scoped to one authority.

Service rules live in `data/services/`: `index.json` enables each service and `*.json` holds its validated contract (documents, tasks, conditional rules, steps, warnings, official links). The loader in `backend/app/services/loader.py` fails closed if a rule is missing a `service_id`, an `https` `source_url`, or a `last_verified` date. Fee/checklist data for the e-Passport wizard is still read from `data/fees.json` and `data/requirements.json`.

## Routes

- `/services`, `/services/[serviceId]`, `/services/[serviceId]/guide` — service directory, overview, and conditional checklist.
- `/identity-check` — local document consistency comparison (no upload to any server, no storage).
- `/wizard`, `/fees`, `/copilot`, `/redflag`, `/grs` — e-Passport wizard, fees, copilot, service-aware fee checker, and the browser-only GRS drafter.

## API

- `GET /api/services`, `GET /api/services/{service_id}`, `POST /api/services/{service_id}/checklist` — catalog, guide content, and conditional checklist.
- `GET /api/fee-schedules` — public, non-sensitive catalog of verified fee schedules (labels, amounts, official source URLs, verification dates). The browser performs the calculation.
- `POST /api/copilot/ask` accepts an optional `service_id` to scope retrieval to one authority and pick that service's fallback string.
- Existing e-Passport endpoints (`/api/checklist`, `/api/fees/calculate`, `/api/redflag/check`, `/api/grs/draft`) are unchanged. The complaint page no longer calls `/api/grs/draft`, so complaint text stays in the browser; the endpoint remains for API callers.

## LLM provider (optional, copilot only)

The source-grounded copilot can use any OpenAI-compatible chat-completions endpoint. **OpenRouter** is the default in `.env`:

```powershell
# .env
LLM_API_BASE=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-4o-mini          # any OpenRouter model id
LLM_API_KEY=sk-or-v1-...              # https://openrouter.ai/keys
LLM_APP_TITLE=ShebaShathi BD          # optional dashboard attribution
LLM_HTTP_REFERER=http://localhost:3000 # optional dashboard attribution
```

How it behaves:

- **No key → no provider call.** The copilot answers with the cited source excerpt (`generation_mode: "extractive"`).
- OpenRouter is detected from the base URL; `HTTP-Referer` and `X-Title` are sent only to OpenRouter and only when configured.
- If a model does not support JSON mode, the request is retried once without `response_format` and a fenced JSON answer is still parsed.
- Provider errors (401 invalid key, 402 no credit, 429 rate limit, 5xx) produce a safe message; the API key is never logged or echoed.
- `GET /health` reports `llm_provider` and `llm_model` (never the key); the copilot shows which provider answered.
- The provider only ever receives the copilot question and the retrieved source excerpts. The complaint drafter, the document comparison and the voice input never contact any external service — see `docs/PRIVACY.md`.

Swap in OpenAI or any other compatible endpoint by changing `LLM_API_BASE` and `LLM_MODEL` only.

## Project documentation

- [Product scope and implementation roadmap](docs/PLANNER.md)
- [Security requirements and agent self-audit](docs/SECURITY_ASSESSMENT.md)
- [Privacy and local-processing map](docs/PRIVACY.md)
- [Production deployment steps (Render + Vercel)](docs/DEPLOYMENT.md)
- [3-minute demo script and backup-recording checklist](docs/DEMO_SCRIPT.md)
- [Local UX check notes](docs/UX_CHECKS.md)

## Validation

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest app/tests -q
python -m compileall -q app
cd ..\frontend
npm test           # vitest: file validation, complaint rules, comparison, fee maths
npm run lint
npm run build
npm run verify:local    # optional: OCR + PDF extraction on synthetic fixtures
npm run verify:speech   # optional: the local Whisper model loads and runs
npm run verify:privacy  # optional: headless Chrome check that no sensitive value is transmitted
```

`npm run verify:local` needs the synthetic fixtures (`python scripts/make_local_fixtures.py`) and exercises the same Tesseract build, language data and pdf.js library that the browser uses. `npm run verify:speech` loads the shipped Whisper model through the same pipeline the page uses. `npm run verify:privacy` drives the three sensitive workflows in headless Chrome over the DevTools protocol with the app running, and fails if a complaint text, a document, an extracted identity value or a claimed amount appears in a request, in `localStorage`/`sessionStorage`, or in the console. The privacy check needs the dev server on `http://localhost:3000` and a local Chrome or Edge installation.

The frontend's PDF actions use the browser print dialog so the bundled Noto Sans Bengali font shapes Bangla text. Choose “Save as PDF”. The final output depends on the browser's print-to-PDF implementation.

## Limitations

- Source snapshots were manually checked and are not auto-refreshed; dates are displayed so users can verify changes. Review service rules on a cadence and after official notices, recording each change in `data/VERIFICATION_LOG.md`.
- The copilot only knows the small, checked-in source corpus. It returns the selected service's official-site fallback when retrieval/citation checks fail.
- The document consistency check compares text only; it does not decide which value is legally correct and does not authenticate any document or person. It also cannot read a document that is too unclear to scan; every extracted value is shown unconfirmed for review.
- Voice input uses a small local Whisper model. Bangla dictation is usable but not perfect, so the transcript is editable before it is used.
- The fee checker only shows amounts for services whose schedule was verified against an official page; the rest show "manual verification required" and a link to the official portal.
- Browser-local processing keeps this application from uploading your documents. It does not protect against a compromised device, a malicious browser extension, or malicious application code. See `docs/PRIVACY.md`.
- No public deployment URL is included; see `docs/DEPLOYMENT.md` for the Render/Vercel steps. Accuracy is covered by the 30-question offline eval set in `backend/app/tests/eval_questions.json` (`pytest app/tests/test_eval_offline.py`).
