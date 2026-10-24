# Security self-audit — AI intake and UX changes (2026-10-23)

> Scope: the changes made in this work session. This is an independent
> self-review, not a penetration test, certification, or guarantee of security.
> The required workflow is in `docs/SECURITY_ASSESSMENT.md`.

## Change and data flows reviewed

- `POST /api/intake`: free-text situation → request validation → per-process
  rate limit → identity-number rejection → optional LLM classifier or
  deterministic router → validated catalog task → missing questions.
- `POST /api/services/{id}/checklist`: minimal answers (age/boolean/select) →
  validated service engine → documents/steps/source metadata.
- Optional provider calls: OpenRouter/OpenAI-compatible classifier for intake;
  existing grounded copilot calls. Retrieval and the fee/photo handlers remain
  deterministic.
- Frontend: home intake component, global language switcher/mobile menu,
  canonical guide fee estimator, `/wizard` redirect, and the docs/tests added
  around them.
- Data stores: no account/database; Chroma and service JSON remain application
  data; browser storage is used only for public GET cache and the language
  preference.

## Threats considered

- Identity numbers, OTPs or passport data typed into the intake leaking to a
  provider, log, cache, or API response.
- Prompt injection or malformed model output changing the service, task,
  answers, fee, or document list.
- Model hallucination of fees, documents, or eligibility rules.
- Stored/reflected XSS through user text, model output, service labels, or
  citations.
- Arbitrary service/task overrides reaching files or bypassing the catalog.
- Cost/availability abuse of the LLM and embedding paths.
- Open redirects or unsafe external links from validated data.
- Secrets exposed in client code, errors, logs, or deployment configuration.

## Controls implemented or verified

- `IntakeRequest` uses `extra="forbid"`, a 2–1000 character text limit,
  whitespace rejection, and narrow `language`/`service_id`/`task_id` fields.
- Rate limiting runs before PII checks and model/retrieval work. It is
  process-local and documented as such.
- `contains_identity_number()` rejects long numeric identifiers, MRZ-shaped
  strings, and sensitive-keyword-plus-number patterns before any provider call.
  This is heuristic; it is not claimed to be complete.
- `rag.guard.classify()` deterministically blocks bribe, intermediary, cash
  bypass, biometric bypass and fake-document requests before retrieval or
  generation.
- LLM output is parsed as JSON and then constrained: the service must be enabled,
  the task must belong to it, answers must be declared by that task and pass
  type/range/option checks, and minor/adult age constraints are re-applied.
  Unknown fields are discarded.
- Fees and passport-photo answers use deterministic handlers; the model never
  selects a fee tier. Checklist facts come from `data/services/*.json`.
- Citations and official links come from validated stored metadata; the loader
  requires `https` URLs and dates.
- User/model/label text is rendered as React text. The home title's
  `dangerouslySetInnerHTML` was removed in favour of two translated text lines.
  External links use `rel="noopener noreferrer"`.
- Intake text is not written to `localStorage`, `sessionStorage`, IndexedDB,
  cookies, a database, or application logs. POST responses are not cached by the
  API client; only public GETs are cached.
- Provider errors are converted to safe status messages; the API key is never
  logged or returned. The key is optional and server-only.
- CORS is configured from `CORS_ORIGINS` (default localhost); production docs
  require the exact Vercel origin and no wildcard with credentials.
- CSP and security headers remain in `next.config.js`; `connect-src` is limited
  to self plus the configured API origin.
- `ml_core/` was not modified.

## Checks run and results

| Check | Result |
|---|---|
| `python -m pytest app/tests -q` | **127 passed** (1 Starlette deprecation warning) |
| `npm test` | **78 passed** (7 files) |
| `npm run build` | passed; 10 routes generated |
| `npm run lint` | no errors; 7 pre-existing `react-hooks/exhaustive-deps` warnings |
| `python scripts/live_eval.py` | **26/26** grounded + expected term; **4/4** adversarial fallbacks |
| `npm run verify:intake` | **20/20** headless UI checks |
| API smoke test | child passport → `minor` + `age=5` + `has_own_nid=false`; PII 422 `IDENTITY_DATA_REJECTED`; bribe request blocked; fee 4,025 BDT; checklist 3 documents/4 steps |
| SSR/nav checks | one `.nav-lang`, one `.nav-menu-toggle` on all tested pages; `/wizard` redirects |
| Visual checks | reviewed home desktop, 375px home, and guide screenshots from headless Chrome |

The UI script and API smoke test used synthetic inputs only. The full live eval
and its limitations are recorded in `docs/EVAL_RESULTS.md`; the offline eval
mocks retrieval/LLM and is not live factual evidence.

## Findings

1. **Fixed — low: unsafe static HTML in the home title.** The old
   `dangerouslySetInnerHTML` rendered a locale string (not user/model data), but
   it was an unnecessary sink. It is replaced with separate text keys and a
   `<span>` around the second line. No `dangerouslySetInnerHTML` remains in the
   frontend.
2. **Fixed — low: external-link relation hardening.** Three links used only
   `rel="noreferrer"`; they now use `noopener noreferrer`.
3. **Medium, accepted for single-instance deployment: process-local rate
   limiting.** Limits are held in each backend process. Multiple instances or a
   proxy that presents one client address can defeat or over-group the limit.
   `docs/DEPLOYMENT.md` requires a shared store before scaling; the app is
   documented as a single-instance deployment.
4. **Medium, explicit privacy tradeoff: optional provider sees intake text.**
   When `LLM_API_KEY` is set, the description is sent to the configured provider
   for classification after the heuristic PII check. It is not persisted or
   logged by this application, and `docs/PRIVACY.md` states this plainly. Leave
   the key unset for fully deterministic, no-provider intake. The heuristic can
   miss unusual identifier formats; users are told not to paste identity data.
5. **Low: CSP still permits inline script/style.** This is required by the
   current Next.js setup and pre-dates this work. All application-rendered text
   is escaped, and no user HTML is used. A nonce-based CSP would be a separate
   hardening project.
6. **Low: no public deployment or real-device verification.** No Lighthouse,
   iOS/Safari, physical 375px device, screen-reader, or clean-clone Docker run
   was performed here. The headless viewport and menu checks are not a
   substitute for those.

No critical or high findings remain open. The medium items are deployment and
privacy tradeoffs that are documented, not silently accepted.

## Remaining risk and checks not run

- No third-party penetration test, load test, or distributed rate-limit test.
- No live Render/Vercel deployment, TLS/CORS verification, or Lighthouse score.
- No physical phone, screen reader, Bangla PDF export, or throttled-network test.
- The heuristic identity-number check can produce false negatives/positives.
- The provider-dependent live eval is small and can change with model/corpus
  updates.

## Verdict

The changed flows were reviewed against the repository's security requirements.
Critical/high issues found during this review were fixed before completion. The
remaining medium risks are explicit deployment/privacy limitations, and the
feature should not be described as secure beyond the checks above.
