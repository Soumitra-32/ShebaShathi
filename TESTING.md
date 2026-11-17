# TESTING.md

Never claim a check passed unless you ran it. If a check can't run (no network, missing model, missing dependency), say so in the report.

## Commands
```powershell
# Backend (repo root)
$env:PYTHONPATH = "backend"
pytest backend/app/tests -q
pytest ml_core/tests -q                     # shared embedder/classifier/pipeline checks
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
`ml_core/tests/` covers the shared embedder, intent classifier and pipeline. `ml_core/` is no longer treated as frozen; any edit needs its tests plus the backend suite before it ships.

## Existing backend coverage (`backend/app/tests/`)
`test_fees`, `test_fee_schedules`, `test_checklist`, `test_services`, `test_service_ingest`, `test_freshness`, `test_redflag`, `test_grs`, `test_intake`, `test_rag`, `test_fee_answer`, `test_photo_answer`, `test_privacy_guard`, `test_chat_and_brief`, `test_relevance`, `test_hardening`, `test_llm_provider`, `test_eval_offline`, `test_api_flows`.
Eval data: `eval_questions.json`, 30 items (26 answer, 4 adversarial), e-Passport only.
`test_relevance`, `test_hardening` and the off-topic cases in `test_chat_and_brief` are the offline out-of-domain gate: a weather/joke/politics/maths/cooking/coding/prompt-injection question must return the fallback and must not retrieve or call a provider. They also cover government-shaped hard negatives (trade licence, police clearance, student visa, bank account) and the generic-licence misrouting fix. `test_hardening` covers the semantic margin, passage-encoded prototypes, fail-closed embedding errors, deterministic document and task-step answers, the extractive support check, language-first retrieval, and the shared SQLite rate-limit store.

## Frontend coverage (`frontend/tests/`)
`api-intake`, `compare`, `complaint`, `fees`, `files`, `intake`, `language`, `share`, `status-guide`.

## What every change must test
| Change type | Required tests |
|---|---|
| New or changed rule/fee | Source URL + date present; loader rejects missing fields; checklist for each branch; fee matches the official page; regression for e-Passport |
| New endpoint or field | Valid case, unknown field rejected, oversized, wrong type, NaN/inf, whitespace-only, generic error body |
| Intake / copilot | Identity-number input and labelled name/address/date-of-birth/document-shape input blocked before any provider call; guard blocks bribe/agent/cash/biometric/fake-document; bad LLM JSON falls back; unknown chunk id rejected; numeric mismatch rejected; no key gives deterministic, supported extractive or safe fallback; semantic scope fails closed |
| Rate limiting | Limit then 429 with `Retry-After`; disabled mode; two limiter instances sharing one hashed SQLite window; namespaces do not consume each other's budget; proxied client keys only when explicitly trusted; the optional Redis path uses a hashed key and a broken store degrades to memory |
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