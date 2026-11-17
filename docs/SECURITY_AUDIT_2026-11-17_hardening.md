# Security and quality audit — copilot hardening (2026-11-17)

> Scope: the changes in the working tree after the 2026-11-16 copilot audit.
> This is a focused self-audit, not a penetration test or a certification.
> `ml_core/` was not modified.

## 1. What changed and why

The 2026-11-16 audit left five documented risks:

1. the relevance gate was lexical only and rejected valid paraphrases;
2. the privacy screen missed several common personal-data shapes;
3. assistant-history screening rejected public hotlines and fees, so a normal
   follow-up could be answered locally for no privacy benefit;
4. with no LLM key, an unrelated retrieved excerpt could be presented as an
   answer;
5. the rate limiter was process-local, so extra worker processes multiplied the
   effective budget.

This change addresses each one:

| Risk | Control |
|---|---|
| Paraphrase misses | The lexical gate still runs first. A separate E5 semantic fallback requires both a minimum in-domain score and a margin over the nearest out-of-domain examples. Embedding errors fail closed. A purely semantic match without a named service asks the user to choose one instead of searching across services. |
| Document questions | `backend/app/rag/documents_answer.py` answers named tasks directly from `data/services/*.json`, and otherwise shows the published per-task lists. No model chooses a document. |
| Task/step requests | `backend/app/rag/process_answer.py` answers a clearly named task from the published `steps_bn` / `steps_en`, so "I need a passport for my infant" and "renew my licence" do not depend on retrieval. Fee/document/photo/status questions are left to their own deterministic tool, and an eligibility question is left to retrieval. |
| Unsupported no-LLM excerpt | `backend/app/rag/extractive.py` accepts an excerpt only when it shares a non-service task word with the question, is from the asked section, or scores at least `EXTRACTIVE_MIN_SCORE`. Otherwise the safe fallback is returned. |
| Privacy gaps | `backend/app/privacy.py` now also screens labelled names, labelled postal addresses, dates of birth, passport/licence-style numbers, document-label values, data URLs/base64 and additional credential terms. |
| History false positives | Assistant-role turns use a narrower screen: it catches secrets and labelled identifiers but allows public hotlines, fees and waiting periods. User turns and the current question keep the full screen. |
| Process-local limiter | `backend/app/rate_limit.py` adds a SQLite sliding window shared by worker processes on one host. Client keys are SHA-256 hashed with a namespace; raw addresses are not stored. The path is resolved against the repository root for relative values, and a broken store degrades to memory instead of preventing startup. |
| Multi-host limiter | An optional Redis sorted-set window uses one atomic Lua script, so `RATE_LIMIT_STORE=redis` shares one budget across hosts. It is not part of the default single-instance deployment; a missing/broken Redis server degrades to the local window. |
| Proxy client identity | `client_key()` ignores forwarding headers by default. With `TRUST_PROXY_HEADERS=true` it uses the rightmost untrusted `X-Forwarded-For` value and only when the direct peer is in `TRUSTED_PROXY_IPS` (when that allowlist is set). Render's terminating proxy is enabled explicitly in `render.yaml`. |
| Mixed-language excerpts | Service and fee chunks are indexed once per language (`en`, `bn`) with language metadata. Retrieval tries the requested language first and falls back to all languages only when that language has no indexed source, so a no-key excerpt is not a bilingual block. |
| Generic-licence misrouting | Bare "licence" was removed from the driving-service triggers in the relevance gate and fee tool. "Trade licence" and "fire licence" no longer become a driving-licence fee answer; an unsupported-service question returns the fallback rather than a service prompt, while a bare task-only question still asks which service. |
| Semantic boundary | Passages, not queries, are used for the E5 scope prototypes; the calibration set is now 84 in-domain and 86 out-of-domain examples, including government-shaped hard negatives (trade licence, police clearance, student visa, bank account, marriage, vehicle registration). `SEMANTIC_SCOPE_MIN_MARGIN` is `0.01`. |

Configuration defaults and documentation were updated in `.env.example`,
`render.yaml`, `docker-compose.yml`, `docs/DEPLOYMENT.md`, `docs/PRIVACY.md`,
`docs/SECURITY_ASSESSMENT.md`, `docs/EVAL_RESULTS.md`, `README.md`,
`ARCHITECTURE.md`, `TESTING.md`, `TASK.md` and `DECISIONS.md`.

## 2. Data flows and trust boundaries

- The new semantic fallback embeds the user's question **locally** with the
  same self-hosted model used for retrieval. It sends nothing to a provider.
- Deterministic document and task-step answers read only validated service data.
  They do not send the question to a model or include it in a citation.
- The extractive check is local and deterministic. It chooses whether to show a
  chunk; it never rewrites source text.
- Assistant-role history is still untrusted. The narrower screen is a
  deliberate trade-off, documented in `docs/PRIVACY.md`.
- The rate-limit database stores only a SHA-256 hash of
  `namespace:client-key` plus a timestamp. It is operational state, not chat or
  identity data.
- No request body, question, identity value or raw client address is logged by
  the new code. The SQLite error path logs only the exception class.

## 3. Abuse cases considered

| Abuse case | Result |
|---|---|
| Off-topic question with a high-scoring chunk | Rejected before retrieval; no provider call. |
| Prompt injection in an unrelated question | Still rejected by the relevance gate; the guard handles unsafe intent separately. |
| Sensitive value in the current question | Full screen; answered locally or safe fallback; provider never called. |
| Sensitive value planted in an assistant turn | Narrower screen still catches labelled identifiers, secrets, passport shapes, MRZ, email, DOB and data URLs. |
| Public hotline/fee in history | No longer causes a false positive; follow-up can be answered normally. |
| Unlabelled bare long number in an assistant turn | Now caught unless it is a verified public hotline; the allowlist covers the published hotlines and country-code/trunk-zero forms. |
| Unlabelled birth date in the current question | Common `DD/MM/YYYY` and `YYYY-MM-DD` forms in the 1950-2026 birth range are screened; ordinary 2027 deadlines are not. |
| Extra worker process bypassing the limit | Shared SQLite window closes the same-host bypass. |
| Extra host | Closed when `RATE_LIMIT_STORE=redis` is configured; the default single-host deployment uses SQLite. |
| Spoofed `X-Forwarded-For` | Ignored by default; behind a trusted proxy the rightmost untrusted address is used, and an unparseable or untrusted direct peer cannot borrow a forwarded identity. |
| Broken/unwritable rate-limit file | Falls back to the process-local window and logs the class only. |
| Broken/unreachable Redis | Falls back to the local window and logs the class only; no request body or credential is logged. |
| Embedding model missing | Semantic fallback returns no match; lexical decision remains; safe fallback. |
| LLM returns empty/unsupported answer | `answerable=false` is respected; no unrelated excerpt is substituted. |
| Mixed-script no-key excerpt | Language-specific chunks plus requested-language-first retrieval remove the bilingual block. If the requested language has no source, pure source text in the other language may be shown. |
| Natural task request without a task word ("blue travel book for my infant") | Deterministic child-passport steps from validated data; no retrieval or provider call. |
| Eligibility question that mentions a task ("child passport without birth certificate") | The task-step tool declines because the question is not a steps request; retrieval answers from the document source. |
| Unsupported service with a task word ("trade licence fee") | The generic service/task words do not route to driving licence; fallback or a service prompt, never a fabricated answer. |

## 4. Checks actually run

Backend:

```text
pytest backend/app/tests -q
220 passed, 4 warnings
```

The retrieval index was rebuilt as v4 with `python -m app.rag.ingest --rebuild`
(321 chunks: 170 Bangla, 151 English; each service/fee fact is indexed once per
language).

The warnings were existing deprecations (`on_event`, TestClient/httpx) and a
pytest cache write-permission warning; no test failed.

Frontend:

```text
npm run lint      -> no ESLint warnings or errors
npx tsc --noEmit  -> no output (pass)
npm test          -> 9 files, 86 tests passed
npm run build     -> compiled successfully; 11 pages generated
```

Configuration: `docker-compose.yml` and `render.yaml` parse as valid YAML.
A Docker image build was not run because Docker is not installed here.

Endpoint probes with the real ONNX embedder and **no provider key** (FastAPI
test client, local index):

| Probe | Result |
|---|---|
| `I need the little blue travel book for my infant` (e-Passport) | Deterministic child-application steps, `grounded=true`, `answer_found=true`, no retrieval. |
| `Can my child get a passport without a birth certificate?` (e-Passport) | Task-step tool declined; cited extractive document answer, `grounded=true`. |
| `Renew expired driving licence?` (driving licence) | Deterministic renewal steps, `grounded=true`. |
| `আমার সন্তানের পাসপোর্ট কীভাবে নেব?` (Bangla, e-Passport) | Deterministic Bangla child-application steps, `grounded=true`. |
| `How much does the government charge for the little red book used to travel outside the country?` (e-Passport) | Deterministic fee clarification, `grounded=true`. |
| `What do I need to do after a family member stops living?` (death registration) | Deterministic document overview, `grounded=true`. |
| `Where do I go to get the blue official identity folder replaced after losing it?` (NID) | Semantic path accepted; cited extractive answer, `grounded=true`. |
| `What is the weather today?` | `not_found`, no citations, no retrieved chunks. |
| `What documents do I need for a passport?` | Deterministic document overview, no retrieval. |
| Public-hotline assistant history + `How long does normal delivery take?` | `safety_blocked=false`; the history was not falsely rejected. |
| Unsupported excerpt mock (`passport office closed` for a birth-name correction) | `answer_found=false`, no citation, safe fallback. |
| `What is the fee for a trade licence?` / `How do I apply for a fire licence?` | `not_found` / safe fallback; no driving-licence fee tool, retrieval or citation. |
| `How do I apply for a job?` | `not_found`; the hard-negative semantic calibration rejects the government-shaped question. |
| English/Bangla passport process and document questions | Retrieved chunks were `language=en` / `language=bn` respectively; excerpts were single-language. |
| Assistant history with `+880 9666-716445` and a follow-up | Not falsely screened; the public hotline allowlist applied. |
| Assistant history with an unlabelled 10-digit reference | Screened locally; no provider call. |

No live-provider evaluation, deployed-service smoke test, browser E2E
(`verify:privacy`, `verify:intake`), load test or mobile Lighthouse run was
performed for this change. The 2026-10-23 live-provider result remains the only
recorded live run.

## 5. Self-audit findings

### Fixed before reporting

- **Medium — relative state path depended on the working directory.** A
  `.state/...` value could create a different database under `backend/` when
  uvicorn was launched there. `config._resolve_rate_limit_db_path()` now resolves
  relative paths against the repository root, and a test covers it.
- **Low/Medium — a bad SQLite path could prevent startup.** A read-only or
  directory path raised during limiter construction. Construction now logs the
  error class and degrades to the memory store; a test covers it.

### Accepted / residual

- **Low — multi-host rate limiting is configuration, not the default.** SQLite
  shares one host. A multi-host deployment must set `RATE_LIMIT_STORE=redis`
  with a managed `RATE_LIMIT_REDIS_URL`; the adapter is implemented and tested
  against a fake client, but this environment has no Redis server, so the live
  Lua path was not exercised end to end. The default single-instance deployment
  is documented and needs no Redis service.
- **Low — proxy client identity needs an allowlist.** `TRUST_PROXY_HEADERS`
  is off by default. With it on and an empty `TRUSTED_PROXY_IPS`, the service
  trusts the rightmost forwarded address; that is only safe when the backend is
  reachable exclusively through the proxy. Render is configured for its
  terminating proxy; other deployments must set the provider's CIDRs.
- **Medium — semantic calibration is still a curated set.** The fallback now
  uses 84 in-domain and 86 out-of-domain prototype passages, including hard
  negatives, not a held-out benchmark. It can still reject a valid paraphrase
  or accept a very close off-topic question. It fails closed, and the lexical
  gate remains first.
- **Low/Medium — privacy screening is heuristic.** Unlabelled names, addresses,
  unusual document formats and birth dates outside 1950–2026 can be missed.
  The screen is shape-only and deliberately conservative; the UI still
  instructs users not to paste identity data.
- **Low — no-key excerpt coverage.** Deterministic steps now cover a named task
  even when the question uses no task word. A paraphrase that names no task and
  no clear service can still share no task word and score below
  `EXTRACTIVE_MIN_SCORE`; it receives the safe fallback instead of a possibly
  unrelated excerpt. This is deliberate.
- **Low — task-step trigger is heuristic.** The step tool fires on explicit
  process words or a narrow "I need/want ..." request plus a detected task. A
  question that asks for eligibility in an unusual phrasing can still fall
  through to retrieval or the safe fallback; it does not fabricate steps.
- **Low — deterministic document overview can be broad.** When no single task
  is named, the tool lists the published per-task document sets rather than
  guessing one. The answer is sourced but longer.
- **Low — requested-language fallback.** If the requested language has no
  indexed source for a service, retrieval falls back to the other language.
  The excerpt is pure but may be in Bangla for an English question (or vice
  versa). The alternative is a bilingual block or a false fallback.
- **Low — SQLite writes are synchronous.** The window operation runs in the
  request path. It is a tiny indexed table and the app rate-limits the endpoints
  themselves; no load test was run.
- **Low — no live model run.** The semantic margin and `answerable` handling
  were exercised with the real local embedder and mocked generation, not a live
  provider.

## 6. Confirmation

- `ml_core/` is untouched.
- No service, account, database server, telemetry or government-portal
  automation was added by default. The SQLite file is operational state on the
  existing host, not an application database. The optional Redis adapter adds a
  client library and code path only; a multi-host operator must provision the
  external store deliberately.
- No fee, document, rule, URL or date shown to a user was invented for this
  change; deterministic answers read `data/services/*.json` and retrieve their
  existing source URLs and verification dates.
- The language split added no new facts; it re-indexes the same verified text,
  and the Bangla note is a translation of the existing derived photo statement.

## 7. Addendum - P19 ML-core performance (2026-11-17)

The user explicitly permitted edits to `ml_core/`, which was otherwise frozen.
This addendum covers only the runtime changes in P19.

### Data flows and trust boundaries

- Unchanged. The query cache lives in process memory and stores a SHA-256
  digest plus the resulting float vector. It does not store the raw question,
  write to disk, log the question, or call a provider.
- Cached values are returned as copies, so a caller cannot mutate the cache.
- The backend disables caching for any question that looks sensitive; even the
  digest/vector pair is not retained for those requests. The semantic-scope
  helper applies the same rule before the endpoint's privacy branch.
- The cache is bounded (`ML_EMBEDDING_CACHE_SIZE`, default 512). At E5-small's
  384 dimensions this is under 1 MB of vector data per process, plus small
  dictionary overhead.
- The production ONNX path applies the same digest-keyed cache, sensitive-text
  bypass, prefix guard and batch deduplication; no new model or service was
  added.

### Abuse cases and controls

- **Sensitive text in a repeated question:** the cache key is a digest and the
  value is an embedding, not the text. The existing privacy screen still runs
  before retrieval/provider calls; this change does not forward or persist any
  new data.
- **Unbounded memory:** the LRU has a fixed maximum and an environment knob.
- **Wrong vector after a model switch:** a model change replaces the instance
  cache; `reset()` clears it explicitly.
- **Duplicate input changing row order:** duplicates are encoded once and
  mapped back by position; tests assert the first two rows match and the third
  differs.

### Checks run

- `pytest backend/app/tests -q` - 222 passed.
- `pytest ml_core/tests -q` - 12 passed.
- Local microbenchmark: repeated query cache hit averaged 0.062 ms on the
  torch path (first call 611.5 ms including model work) and 0.019 ms on the
  ONNX path (first call 19.0 ms). These are single-machine observations, not a
  load test.

### Residual risks

- The cache is per process, so separate workers do not share it.
- The benchmark was sequential, not concurrent; no contention or load test was
  run.
- The cache remains an optimisation, not a correctness mechanism. Model,
  prefixes and retrieval thresholds are unchanged.

### Confirmation

- No fee, document, rule, URL, date or privacy boundary changed.
- `ml_core/` is now modified by explicit user permission; this supersedes the
  earlier "untouched" confirmation for P16-P18 only.

## P20 verification addendum (2026-11-17)

Two live-eval gaps were fixed after the P19 checks: `/api/copilot/ask` now
applies the same deterministic task-step tool as `/api/copilot/chat`, and a new
`payment_answer.py` returns the verified e-Passport `payment_channels` list from
`data/requirements.json` in the requested language.

### Data flow and controls

- The payment answer reads only local, source-dated data and returns the source
  URL plus verification date. It does not call the provider, retrieve chunks or
  accept identity data.
- The payment tool is scoped to `epassport`; an absent or different service does
  not receive e-Passport channels.
- The tool is intentionally narrow: document questions that merely mention
  paying the fee are left to the document tool.
- The ask endpoint's new step path uses the same validated `steps_bn` /
  `steps_en` data as chat. Eligibility questions still decline the step tool.
- No new secret, service, database, telemetry or deployment configuration was
  added.

### Checks run

- Backend: 230 passed.
- Shared ML: 12 passed.
- Live provider: 26/26 grounded, 26/26 expected term, 4/4 adversarials refused
  (OpenRouter `anthropic/claude-sonnet-4.6`).
- Browser E2E: fee, payment, renewal, off-topic, sensitive-text and mobile
  overflow cases passed against the production frontend in headless Edge.
- Local concurrent load test: 120 requests at concurrency 16, all HTTP 200,
  p95 44.5 ms and no grounded/answer-found failures (ONNX/numpy, no provider).

### Residual risks and checks not run

- The payment trigger is lexical; an unusual paraphrase may still go through
  retrieval, where the source-grounded verifier applies.
- Docker, a deployed smoke test and a live Redis server were unavailable on
  this machine. The Redis adapter remains covered by its fake-client test only.
- The load result is a single-host synthetic run, not deployed capacity.

`ml_core/` remains modified from P19; P20 itself changed only backend files,
tests and documentation.
