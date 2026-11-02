# AGENTS.md — ShebaShathi BD

Independent, Bangla-first guide for Bangladesh citizen services (e-Passport, birth registration, NID, driving licence, death registration). It is NOT a government service. It never submits applications, authenticates people or documents, or stores identity data.

## Read order (before changing anything)
1. This file
2. `docs/PLANNER.md` (scope, rules, phases; §0 operating rules are binding)
3. `docs/SECURITY_ASSESSMENT.md` (mandatory workflow) and `docs/PRIVACY.md` (data flows)
4. `ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `TASKS.md`

If documents conflict: code behaviour verified by tests > `DECISIONS.md` (newest entry) > `PLANNER.md`. Fix the stale document and log it in `DECISIONS.md`.

## Hard rules (never break)
1. **No hallucinated facts.** Every fee, document, rule, deadline or URL shown to a user comes from `data/` (with `source_url` + `last_verified`) or a retrieved corpus chunk. Otherwise show the service's fallback string.
2. **Deterministic first.** Fees, checklists, eligibility and routing are code/config. The LLM only classifies intent and explains retrieved text. It never picks a fee, document or rule.
3. **Privacy.** Never request, send, log or persist NID/BRN/passport/licence numbers, document images, OTPs, credentials, complaint text, OCR output, voice audio or transcripts. Complaint drafting, OCR, voice and document comparison run **in the browser only**, from self-hosted assets, with no cloud fallback.
4. **Do not modify `ml_core/`** unless the user explicitly authorizes it.
5. **Keep the stack and scope.** Next.js 15 + Tailwind 3 (frontend), FastAPI (backend), Chroma + multilingual-e5-small (RAG). No new services, accounts, databases, telemetry or government-portal automation.
6. **Bangla first.** Default language is `bn`; every user-facing string needs `bn` and `en`.
7. **Never fabricate** statistics, fees, source dates or verification claims. Unverified = "manual verification required" plus the official portal link.
8. **No secrets in the repo, logs, chat or screenshots.** Never print `.env`. Placeholders only in `.env.example`.
9. **Never claim a check passed unless you ran it and it passed.** State what you could not run.

## Workflow for every change
1. **Assess** (short note): what data flows change, trust boundaries, abuse cases, controls needed (`SECURITY_ASSESSMENT.md` §1).
2. **Implement** the smallest change that satisfies the task. Reuse existing modules.
3. **Test**: add or update tests, including rejection and failure paths (`TESTING.md`).
4. **Self-audit** the diff as if someone else wrote it. Report findings by severity. Fix critical/high before finishing.
5. **Log**: append `YYYY-MM-DD | task id | what changed | why` to the table in `DECISIONS.md`. Record any rule/fee/source change in `data/VERIFICATION_LOG.md`.
6. **Report** with: what changed, checks run (and results), checks not run, remaining risks, confirmation that `ml_core/` is untouched.

## Roles (use one per task; do not cross boundaries without saying so)
- **Backend agent**: `backend/app/**`, API schemas, engines, RAG. Owns rate limiting, validation, error shapes.
- **Frontend agent**: `frontend/**`. Owns UI, i18n, local-only processing in `frontend/lib/local/**`, CSP in `next.config.js`.
- **Data/Content agent**: `data/**`, `corpus/**`. Only edits from reviewed official pages; updates the verification log; rebuilds the index.
- **QA/Security agent**: tests, evals, dependency audit, self-audit reports. Does not ship features.
- **Docs agent**: README, docs, DECISIONS. Keeps docs true to the code.

## Commands (from repo root; Windows PowerShell shown)
```powershell
# Backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
$env:PYTHONPATH = "backend"
python -m app.rag.ingest --rebuild            # after ANY corpus/ or data/services change
uvicorn app.main:app --reload --app-dir backend --env-file .env
pytest backend/app/tests -q

# Frontend
cd frontend; npm ci; npm run fetch-models; npm run dev
npm run lint; npx tsc --noEmit; npm test; npm run build
```
Ports: frontend 3000, backend 8000 (`/docs` for OpenAPI). Docker: `docker compose up --build`.

## Definition of done
Tests, lint, type-check and build pass (or are explicitly reported as not run); security self-audit written; docs and `DECISIONS.md` updated; no new unverified facts; no sensitive data path added.