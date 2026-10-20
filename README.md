# ShebaShathi BD

Bangla-first, source-grounded help for Bangladesh citizen identity and public services (e-Passport, birth registration, NID, driving licence, and death registration). This is an independent citizen tool, not a government service. It does not submit applications or store applicant data.

## Features

- Service directory with per-service, source-dated guides: e-Passport, birth registration, NID, driving licence, and death registration. Each task resolves to a documented official source; unknown cases get a safe fallback.
- Conditional preparation checklists driven by minimal, non-sensitive answers (age, yes/no, category). The API never accepts identity numbers, files, or credentials.
- Deterministic official e-Passport fee lookup and delivery estimates, with inclusive VAT breakdown and verification date.
- Persistent Chroma retrieval using multilingual E5 embeddings, filtered by `service_id`; answers include source citations, verification dates, chunk IDs, and similarity scores.
- Optional OpenAI-compatible answer generation. With no `LLM_API_KEY`, the copilot shows a cited source excerpt. No local text-generation model is included.
- Browser-only document consistency check: type the same detail from several documents and see which text differs. Values stay in component memory, are never transmitted, cached, or logged, and clear on reload.
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
npm ci
npm run dev
```

Open `http://localhost:3000`. Backend API docs: `http://localhost:8000/docs`.

To run both services using Docker, create `.env` first, then run `docker compose up --build`. The backend image indexes the bundled corpus at startup and persists Chroma/model cache in named volumes. Initial model download may take several minutes.

## Refreshing verified sources and index

Official sources and verification dates are recorded in `data/VERIFICATION_LOG.md`. Update the snapshots under `corpus/` only after reviewing the official page, record the verification, then rebuild with `python -m app.rag.ingest --rebuild`. Every corpus file must carry a `service_id` in its front matter so retrieval stays scoped to one authority.

Service rules live in `data/services/`: `index.json` enables each service and `*.json` holds its validated contract (documents, tasks, conditional rules, steps, warnings, official links). The loader in `backend/app/services/loader.py` fails closed if a rule is missing a `service_id`, an `https` `source_url`, or a `last_verified` date. Fee/checklist data for the e-Passport wizard is still read from `data/fees.json` and `data/requirements.json`.

## Routes

- `/services`, `/services/[serviceId]`, `/services/[serviceId]/guide` — service directory, overview, and conditional checklist.
- `/identity-check` — browser-only consistency comparison (no network, no storage).
- `/wizard`, `/fees`, `/copilot`, `/redflag`, `/grs` — e-Passport wizard, fees, copilot, red-flag checker, and GRS drafter.

## API

- `GET /api/services`, `GET /api/services/{service_id}`, `POST /api/services/{service_id}/checklist` — catalog, guide content, and conditional checklist.
- `POST /api/copilot/ask` accepts an optional `service_id` to scope retrieval to one authority and pick that service's fallback string.
- Existing e-Passport endpoints (`/api/checklist`, `/api/fees/calculate`, `/api/redflag/check`, `/api/grs/draft`) are unchanged.

## Project documentation

- [Product scope and implementation roadmap](docs/PLANNER.md)
- [Security requirements and agent self-audit](docs/SECURITY_ASSESSMENT.md)
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
npm run lint
npm run build
```

The frontend's PDF actions use the browser print dialog so the bundled Noto Sans Bengali font shapes Bangla text. Choose “Save as PDF”. The final output depends on the browser's print-to-PDF implementation.

## Limitations

- Source snapshots were manually checked and are not auto-refreshed; dates are displayed so users can verify changes. Review service rules on a cadence and after official notices, recording each change in `data/VERIFICATION_LOG.md`.
- The copilot only knows the small, checked-in source corpus. It returns the selected service's official-site fallback when retrieval/citation checks fail.
- The document consistency check compares text only; it does not decide which value is legally correct and does not authenticate any document or person.
- No public deployment URL is included; see `docs/DEPLOYMENT.md` for the Render/Vercel steps. Accuracy is covered by the 30-question offline eval set in `backend/app/tests/eval_questions.json` (`pytest app/tests/test_eval_offline.py`).
