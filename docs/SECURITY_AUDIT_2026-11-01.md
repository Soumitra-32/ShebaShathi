# Security self-audit — status guide, fraud shield, share/print (2026-11-01)

> Scope: only this work session's changes. This is an independent self-review,
> not a penetration test, certification, or guarantee of security. The
> required workflow lives in `docs/SECURITY_ASSESSMENT.md`.

## Change and data flows reviewed

- `data/guidance/epassport.json` + new fail-closed loader
  `backend/app/guidance/loader.py`: official status meanings, diaspora
  guidance, fraud warnings — every item carries an `https` `source_url` and a
  `last_verified` date; unknown keys are rejected.
- `GET /api/services/{service_id}/status-guide` (main.py): public, read-only;
  the only variable is the `service_id` path segment, which is matched against
  loaded guide data and fails with `GUIDANCE_NOT_FOUND` (404) when absent.
- `backend/app/rag/status_answer.py`: deterministic keyword→validated-status
  handler inside `/api/copilot/ask`, placed after the existing fee/photo
  handlers and before retrieval. It never calls the LLM and falls through
  (`None`) for anything it cannot match from the validated data.
- Frontend: `/services/[serviceId]/status` page (explanation only, zero form
  inputs), `FraudShield` card on the canonical e-Passport guide (fetches the
  same public endpoint; renders nothing when no verified warnings exist),
  data-driven status-guide link on the service overview, bilingual share
  buttons via a new `lib/share.ts` (Web Share API with clipboard fallback),
  print styles, and nav item `nav.status`.
- Docs/logs: README, `docs/PRIVACY.md`, `docs/UX_CHECKS.md`,
  `data/VERIFICATION_LOG.md` (2026-11-01 checks), `DECISIONS.md`.
- Data stores: no new database, account or telemetry. Browser storage use is
  unchanged in kind: the public GET response may be cached under the existing
  `shebashathi:GET:…` key (public, source-dated content only), and nothing user
  typed is ever written anywhere on the new page.

## Threats considered

- A user pasting an Application ID, OID, date of birth or other identifier into
  the new page: there are **no inputs** on the status page (verified headless:
  `#print-status-guide input` count is 0 in `verify:intake`). The page copy
  tells users to check the live status themselves on the official page.
- Status-content hallucination: impossible through the answer path — text and
  citations can only come from the validated guide file; the loader rejects a
  file missing bilingual text, dates or https URLs and fails closed at import.
- Prompt injection / model output handling: no model call exists in the new
  flow; exceptions in the deterministic handler fall back to the normal
  retrieval path, never to invented content.
- Stored/reflected XSS: all new strings render as React text; every link shown
  (citations, official links, fraud-shield sources) comes from loader-validated
  data and uses `target="_blank" rel="noopener noreferrer"`.
- Unvalidated outbound links: the loader requires `https://` for every
  `source_url` and official link; `http://` URLs fail the contract (tested).
- Offline cache poisoning: the cached GET stores only the public guide payload
  (no request body, no user input), consistent with the documented cache rule.
- Share data leakage: `shareText()` builds its text only from public verified
  content (title, official status URL, hotline); clipboard/share never receives
  user input. A user-cancelled share sheet is treated as `cancelled`, not an
  error or silent clipboard write.
- DoS/abuse: the new endpoint is public and static-content-shaped like the
  existing `/api/services` GET endpoints; it performs no LLM, embedding or
  file-network work and reuses the in-memory validated catalog. No new
  rate-limit surface is required by the existing policy (POST endpoints carry
  the limits).
- Supply chain: no new runtime dependencies (share/print use browser APIs).
- Secret exposure: none; no new configuration, no keys touched.

## Findings by severity

- **Critical / High:** none found.
- **Medium:** none found. (Content freshness is handled by design: each item
  shows its verification date, the guide carries the existing freshness
  badge, and the page links to `/grs` for "report outdated".)
- **Low / notes:**
  1. Keyword matching in `status_answer.py` is heuristic; a question that
     mentions a status term in an unrelated sense gets the status explanation
     rather than retrieval. The answer stays accurate and cited, so impact is
     low; accepted, consistent with the existing fee/photo handlers.
  2. The 3 new lint warnings are the same `react-hooks/exhaustive-deps` pattern
     already present in the codebase baseline (7 warnings); left as-is to
     match surrounding code style.
  3. Status strings are English portal jargon; the Bangla labels shown are
     explanations, and the exact English label is always displayed verbatim so
     users can match it on the official page.
  4. `.gitignore` gained `/node_modules/` and `*.tsbuildinfo` (build artifacts
     only; no content change).

## Checks run for this audit

- Backend suite: `python -m pytest app/tests -q` — **141 passed**
  (14 new status-guide contract/endpoint/answer tests).
- Frontend: `npm test` — **90 passed** (5 new share + 3 new status-guide tests);
  `npx tsc --noEmit` clean; `npm run build` clean (11 routes); `npm run lint`
  — warnings only (10; 7 pre-existing baseline + 3 same-class new).
- Headless UI: `npm run verify:intake` — **27/27 passed**, including six new
  status-guide/fraud-shield assertions and the zero-identity-inputs check.
- Endpoint smoke: `/health` OK; `/api/services/epassport/status-guide`
  returns 6 statuses.

## Not run

- `npm run verify:privacy`, `verify:local`, `verify:speech` (fixtures/browser
  runs not re-executed this session).
- Lighthouse, real-device 375px, iOS Safari, screen-reader passes.
- Docker compose (not available on this machine).

## Boundary confirmations

- `ml_core/` untouched (verified via `git status`).
- No new services, accounts, databases, or dependencies; stack unchanged.
- The product still submits nothing anywhere and stores no identity data.
