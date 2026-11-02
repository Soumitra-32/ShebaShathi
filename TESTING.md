# TESTING.md

Never claim a check passed unless you ran it. If a check can't run (no network, missing model, missing dependency), say so in the report.

## Commands
```powershell
# Backend (repo root)
$env:PYTHONPATH = "backend"
pytest backend/app/tests -q
python backend/scripts/live_eval.py        # needs LLM_API_KEY + network; costs money; run only when asked

# Frontend (cd frontend)
npm run lint
npx tsc --noEmit
npm test                                   # vitest
npm run build
npm run verify:local                       # OCR + PDF on synthetic fixtures
npm run verify:privacy                     # no-network / no-storage checks
npm run verify:intake
npm run verify:speech                      # needs the Whisper model
npm audit --omit=dev                       # run when dependencies change
```
`ml_core/tests/` exists but `ml_core/` is frozen; run it only to check for regressions, never to justify edits.

## Existing backend coverage (`backend/app/tests/`)
`test_fees`, `test_fee_schedules`, `test_checklist`, `test_services`, `test_service_ingest`, `test_freshness`, `test_redflag`, `test_grs`, `test_intake`, `test_rag`, `test_fee_answer`, `test_photo_answer`, `test_privacy_guard`, `test_llm_provider`, `test_eval_offline`, `test_api_flows`.
Eval data: `eval_questions.json`, 30 items (26 answer, 4 adversarial), e-Passport only.

## Frontend coverage (`frontend/tests/`)
`api-intake`, `chat`, `compare`, `complaint`, `fees`, `files`, `intake`, `language`.

## What every change must test
| Change type | Required tests |
|---|---|
| New or changed rule/fee | Source URL + date present; loader rejects missing fields; checklist for each branch; fee matches the official page; regression for e-Passport |
| New endpoint or field | Valid case, unknown field rejected, oversized, wrong type, NaN/inf, whitespace-only, generic error body |
| Intake / copilot | Identity-number input blocked before any provider call; guard blocks bribe/agent/cash/biometric/fake-document; bad LLM JSON falls back; unknown chunk id rejected; numeric mismatch rejected; no key gives extractive/rules mode |
| Retrieval | Cross-service isolation (a NID question never cites birth registration); ambiguous question asks for the service |
| Frontend local tools | Oversized/mismatched magic-byte files rejected; output shown as text; reset clears state; **inspect the Network tab and storage manually**, since unit tests alone don't prove data stays local |
| UI | bn and en both render; 375px layout; loading, error and offline states; HTML/script payloads display literally |
| Dependencies | `npm audit --omit=dev`, lockfile reviewed, no CDN runtime fetches |

## Eval gates (PLANNER Phase 2)
At least 90% of in-scope questions grounded with correct citation; 100% of trick/out-of-scope questions return the fallback or safety message; no number in an answer that is absent from sources. Extend the set to birth, NID, driving licence and death registration (open task T-05).

## Manual pre-demo checklist
1. Fresh `npm ci` + `npm run fetch-models`; `python -m app.rag.ingest --rebuild`.
2. Run with no `LLM_API_KEY` and confirm graceful extractive/rules mode.
3. Walk every route in bn and en at 375px.
4. DevTools Network: complaint, document check and voice send nothing to the backend.
5. `/health` shows `index_count > 0` and the provider/model without the key.