# Security self-audit — copilot relevance, answer state and privacy hardening (2026-11-16)

## Scope and data flows reviewed

- `POST /api/copilot/chat`: question + up to six browser-supplied turns → rate limit → unsafe-intent guard → greeting/deterministic tools → relevance gate → privacy screen → service-scoped retrieval → optional provider → verifier.
- `POST /api/copilot/ask`: question + optional service scope → rate limit → unsafe-intent guard → deterministic tools → relevance gate → privacy screen → retrieval → optional provider → verifier.
- `POST /api/intake`: free-text description → rate limit → sensitive-data rejection → optional classifier or deterministic router.
- `backend/app/privacy.py`, `backend/app/rag/relevance.py`, `backend/app/rag/generator.py`, `backend/app/rag/chat.py`, `backend/app/rag/verifier.py`, `backend/app/rag/fee_answer.py`, `frontend/lib/api.ts`, `frontend/app/copilot/page.tsx`.
- No browser-only document, OCR, voice or complaint path was changed. No new storage, telemetry, external service or dependency was added.

## Threats considered

1. **Off-domain retrieval presented as a grounded answer.** High-similarity embeddings for weather, jokes, politics, maths, coding, cooking or prompt injection could return unrelated service content with `grounded=true`.
2. **`grounded` used as a proxy for “answer found”.** A fallback or greeting could be labelled as grounded in the UI.
3. **Privacy-screen bypass through assistant-role history.** The browser supplies history; a modified client could place a hidden identifier in an assistant turn.
4. **Missed identifier shapes.** Bare 9-character passport numbers, bare 6-digit codes near the word “code”, emails, and secret words such as “otp” without a number.
5. **Unscoped retrieval.** A generic task word could retrieve a random service’s content when no service was selected.
6. **Unsafe generated advice.** A model could add “use an agent” or similar advice even with cited chunks.
7. **Ambiguous or incorrectly scoped fee questions.** The learner-licence clarification asked for the service type even when “learner” was already given.
8. **Provider-side exposure.** The application cannot verify provider logging or retention once a request leaves the backend.

## Controls implemented

- **Relevance gate.** `backend/app/rag/relevance.py` checks for a supported service term, or a task term when a service is already selected. Off-topic questions return the safe fallback without retrieval or a provider call; ambiguous task-only questions ask which service is meant. Applied to both `/chat` and `/ask`.
- **Answer state.** `CopilotAnswer.answer_found` is separate from `grounded`. The UI shows the grounded badge only when both are true, shows the fallback badge only when `answer_found` is false, and shows neither for greetings/safety notices.
- **Model answerability.** Both prompts request `answerable`. A model verdict of “not answerable” returns the fallback instead of an unrelated excerpt. An empty answer with no chunks is also treated as not answerable.
- **Privacy hardening.** The screen now covers assistant-role history, bare 9-character passport-style numbers, 6+ digit codes near “code”, bare 6–9 digit values, emails, “otp”, “2fa”, “authentication code” and similar secret terms. `/api/intake` uses the broader sensitive-data screen instead of the identity-number-only check.
- **Service detection.** “register a birth/death”, “birth record” and “death record” now route to the correct service.
- **Verifier.** It rejects generated unsafe advice (agent/broker/bribe/cash/biometric bypass) in addition to unknown chunks, missing source metadata, unsupported numbers and unsupported URLs.
- **Fee clarification.** The learner-fee clarification lists only the missing parameters (for example learner category 1 or 2) instead of asking for an already-known service type.
- **Test isolation.** A test-only fixture resets the process-local rate limiter between tests so the expanded API coverage does not create order-dependent 429s. Production limiter behaviour is unchanged and still unit-tested.

## Abuse cases checked

- Off-topic question with no scope: fallback, `answer_found=false`, no retrieval/provider call.
- Off-topic question with an explicit service scope: still fallback; explicit scope does not make a joke a service question.
- Ambiguous “what documents do I need?” with no scope: asks which service, no retrieval.
- In-scope question where the model says the context is insufficient: fallback, not the nearest chunk.
- Sensitive data in an assistant-role turn: provider is skipped.
- Unsafe model answer with otherwise valid citations: verifier rejects it.
- Password/code-like text in intake: rejected with the existing `IDENTITY_DATA_REJECTED` code before any classifier call.

## Checks run

- `pytest backend/app/tests -q` — **185 passed**.
- `npx tsc --noEmit` — clean.
- `npm run lint` — no warnings or errors.
- `npm test` — **86 passed**.
- `npm run build` — passed (11 routes).
- Local in-process probe with no provider key: off-topic weather/joke/capital/maths/prompt-injection questions returned `not_found` with no citations; “what documents do I need?” returned `clarify`; the learner-licence fee returned the deterministic category 1/2 clarification; “register a birth/death” resolved to the correct service. A no-key in-scope document question returned an extractive excerpt that did not directly answer it, which is the documented degraded mode.
- No new live-provider evaluation was run. The 2026-10-23 live result remains the recorded provider result; the 2026-11-16 changes are covered by offline regression tests.

## Findings

- **High (fixed):** off-topic questions returned unrelated service excerpts with `grounded=true`. Fixed by the relevance gate and the model `answerable` verdict; regression tests added.
- **High (fixed):** `grounded` did not distinguish a real answer from a fallback. Fixed with `answer_found` and the UI badge logic.
- **Medium (fixed):** assistant-role history was not screened; bare passport-style numbers, code-like digits, emails and some OTP wording escaped the screen. Fixed in `privacy.py` and `chat._screen_conversation`.
- **Medium (fixed):** ambiguous task-only questions retrieved an arbitrary service; a model “not answerable” verdict could be replaced by an unrelated chunk. Fixed by the gate and the early not-answerable return.
- **Medium (fixed):** generated unsafe advice was not checked by the verifier. Fixed by the guard-backed verifier check.
- **Low (fixed):** learner-licence clarification asked for an already-provided service type. Fixed to list only missing fields.
- **Low (fixed):** test suite could hit its own process-local rate limit after adding API cases. Fixed with test-only limiter reset; production behaviour unchanged.

## Remaining risk or limitation

- The relevance gate is lexical, not semantic. It can reject a valid paraphrase that uses none of the configured terms, and it cannot prove that a question containing a service term is answerable. In those cases the user gets a clarification or the safe fallback.
- The privacy screen is heuristic. Names, postal addresses, dates of birth without a recognised identifier, and unusual document-number formats are not reliably detected. There is no redaction: the design avoids forwarding screened text rather than rewriting it.
- Screening assistant history can degrade a follow-up when an official answer contains a long number. This is a deliberate conservative trade-off.
- The rate limiter remains process-local; a multi-instance deployment needs a shared store. Production rate limiting was not load-tested.
- Provider logging and retention cannot be verified from this repository.
- Browser E2E (`verify:privacy`, `verify:intake`) was not run in this session.

`ml_core/` changed: **no**.
