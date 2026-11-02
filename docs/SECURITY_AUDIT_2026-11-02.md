# Security self-audit — multi-turn copilot, AI brief and sticker (2026-11-02)

> Scope: only this work session's changes. This is an independent self-review,
> not a penetration test, certification, or guarantee of security. The required
> workflow lives in `docs/SECURITY_ASSESSMENT.md`.

## Change and data flows reviewed

- `POST /api/copilot/chat` (`backend/app/main.py`, `backend/app/rag/chat.py`):
  accepts a question, up to six recent turns and an optional `service_id`.
  Identity-like numbers in the question **or any user turn** are rejected with
  `422 IDENTITY_DATA_REJECTED` before retrieval, embedding or any model call.
  Deterministic fee/photo/status tools run first. Otherwise retrieval is
  filtered by the resolved service, and the model may only explain those
  chunks. `backend/app/rag/verifier.py` rejects unknown chunk ids, missing
  source metadata, numbers absent from cited chunks, and URLs absent from
  cited chunks. On failure the route returns the best cited chunk unchanged.
- `POST /api/services/{service_id}/checklist/brief` (`backend/app/rag/brief.py`):
  builds the deterministic checklist first, gives the model only that text, and
  verifies the result against it. Any unsupported number, failed provider call
  or bad shape returns the deterministic summary with `grounded: true`.
- `backend/app/llm.py`: default model changed to
  `anthropic/claude-sonnet-4.6`; optional `LLM_MODEL_FALLBACKS` are tried on
  model-unavailable, rate-limit, affordability (402) and unusable-output
  errors. The response reports the model that answered. The key is never
  logged, echoed or returned.
- `backend/app/rag/prompts.py`: `plain_text()` strips light Markdown
  formatting characters only; it does not remove text or numbers.
- Frontend: `/copilot` rebuilt as a multi-turn chat, `ChatModal` reuses the same
  history contract, and `intake-card.tsx` adds an AI brief button/card. Answers
  render as React text with `whitespace-pre-wrap`; no `dangerouslySetInnerHTML`
  was added. The sticker assets are static files under `frontend/public/`.
- Docs/logs: README, `docs/PRIVACY.md`, `docs/PLANNER.md`,
  `docs/DEMO_SCRIPT.md`, `docs/UX_CHECKS.md`, `DECISIONS.md`.
- Data stores: no new database, account, telemetry or browser storage. Chat
  history lives in component state and is cleared on reload.

## Threats considered

- **Identity leakage through chat.** The endpoint checks every user-supplied
  turn, not only the latest question. A number that looks like an NID/passport/
  licence/phone/OTP is rejected before embedding or provider calls. This is a
  shape heuristic, not a guarantee; the UI copy still tells users not to paste
  identity data, and the privacy map records that the provider receives the
  question and recent turns.
- **Prompt injection through history or retrieved text.** The system prompt
  labels history and context as untrusted and forbids role changes, prompt
  disclosure and invented facts. Even if the model is manipulated, the verifier
  only accepts numbers and URLs present in the cited chunks, and citations must
  carry an `https` source URL and verification date. A rejected answer becomes a
  cited extractive excerpt.
- **Cross-service contamination.** Retrieval is filtered by `service_id`;
  service auto-detection may return `None` for ambiguous multi-service text.
  The UI shows the detected service so a wrong scope is visible.
- **Hallucinated fee/document/rule.** The brief receives only the deterministic
  checklist. The chat prefers deterministic tools. The model never selects a
  fee, document or eligibility rule.
- **Provider failure or credit exhaustion.** All provider errors are mapped to
  safe messages; the copilot and brief fall back to verified text rather than
  showing an error or inventing content. The fallback chain is bounded and
  stops on the first success.
- **Stored/reflected XSS.** New content renders through React text nodes.
  Citation links come from corpus metadata validated at load time, not from
  model-written URLs. No new `innerHTML`, `eval` or dynamic script was added.
- **Abuse/DoS.** Both new POST endpoints reuse the existing process-local
  copilot rate limiter. Retrieval is service-scoped. There is no new file
  upload, database write or unbounded server-side history.
- **Secret exposure.** No key is printed, logged, committed or returned.
  `.env` remains untracked; `.env.example` contains placeholders only.
- **Supply chain.** No new runtime dependency was added.
- **Sticker asset handling.** The badge uses a local static image with fixed
  `alt` text and no remote fetch; no tracking pixel or third-party request.

## Findings by severity

- **Critical / High:** none found.
- **Medium:**
  1. Chat history increases the free text sent to the configured provider
     (up to six recent turns). The server stores nothing and identity-like
     numbers are rejected, but a user could still type other personal details.
     Mitigation: explicit privacy copy in the UI and `docs/PRIVACY.md`, no
     server-side history, and the key can be left unset to keep answers
     extractive. Accepted for this feature; do not present the copilot as a
     place for private case files.
- **Low / notes:**
  1. The verifier checks numeric and URL claims, not every possible paraphrase.
     A model could phrase a correct fact imprecisely. The cited source and the
     deterministic checklist remain authoritative and are shown alongside.
  2. The 402 fallback is intentionally broad: an account with genuinely no
     credit will try each configured model before falling back to extractive
     text. This adds latency in that rare case but never changes facts.
  3. Service auto-detection is heuristic and is displayed in the UI; ambiguous
     text can return no service. The user can choose a service explicitly.
  4. Markdown stripping is formatting-only. If a provider emits other markup,
     it remains visible as plain text rather than being interpreted.

## Checks run for this audit

- Backend suite: `python -m pytest app/tests -q` — **150 passed**
  (chat/brief, identity rejection, 404 and 402 fallback, Markdown sanitizer).
- Live endpoint smoke on a fresh server:
  - `GET /health` → `ai_ready: true`, 5 services, 137 indexed chunks,
    `openrouter` / `anthropic/claude-sonnet-4.6`.
  - Bangla lost-passport chat → `grounded: true`, 3 citations,
    `generation_mode: api`.
  - Follow-up with history and service scope → grounded deterministic fee
    answer.
  - AI brief → grounded Bangla brief (`generation_mode: api`); during a
    provider-affordability failure the same endpoint returned the deterministic
    brief with `grounded: true`, `generation_mode: extractive`.
- Regression found and fixed during the live check: the background warmup
  created the cached embedder/Chroma client on a worker thread, and reusing it
  from the request thread made retrieval return zero chunks. The warmup now
  runs on the startup event loop; `POST /api/copilot/ask` and
  `POST /api/copilot/chat` both returned 5 retrieved chunks and 3 citations
  afterwards.
- Frontend: `npm test` — **90 passed (10 files)**; `npx tsc --noEmit` clean;
  `npm run build` clean (11 routes); `npm run lint` — warnings only (10
  pre-existing `react-hooks/exhaustive-deps` warnings, no errors).

## Not run

- No desktop browser was connected, so no new screenshot or headless
  `verify:intake` pass was captured after the last UI/CSS change.
- `verify:privacy`, `verify:local`, `verify:speech`, Lighthouse, real-device
  375px, iOS Safari and screen-reader passes were not re-run.
- Docker compose and the deployed Vercel/Render URL were not available.

## Boundary confirmations

- `ml_core/` untouched.
- No new services, accounts, databases, telemetry or runtime dependencies.
- No identity number, document image, OCR output, voice audio or complaint text
  is sent to the model by these features.
- The product still submits no application and stores no identity data.
