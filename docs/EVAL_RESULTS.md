# Live evaluation evidence (2026-10-23)

> This is a small, local, live-provider evaluation — not a benchmark, a legal
> verification, or a production accuracy claim. It records exactly what one run
> produced so the result can be checked and reproduced.

## What was run

- Command: `cd backend; python scripts/live_eval.py`
- Environment: local Windows machine; backend and retrieval ran in-process
  through the FastAPI test client; no public deployment was involved.
- Retrieval index at the time of this run: **137 chunks** (v3), multilingual E5.
  The current checked-in index is 321 chunks (v4): service and fee chunks are
  indexed once per language so a no-key excerpt is not bilingual; corpus
  snapshots remain Bangla-only, as published. The numbers below are the
  original 2026-10-23 run, not a re-run on the v4 index.
- Provider: `https://openrouter.ai/api/v1` / `openai/gpt-4o-mini`.
- Question set: 30 questions in `backend/app/tests/eval_questions.json` —
  26 answer questions and 4 adversarial/fallback questions. All are
  e-Passport/guide scenarios; the set does not cover every service.
- The script checks whether an answer is grounded, whether the expected
  English **or** Bangla term appears, and whether adversarial questions are
  refused by the safety guard.

## Result

| Measure | Result |
|---|---|
| Answer questions grounded | **26 / 26** |
| Answer questions grounded + expected term | **26 / 26** |
| Adversarial questions correctly refused | **4 / 4** |
| Provider | OpenRouter `openai/gpt-4o-mini` |

Per-question output from that run:

```text
fees-01      answer   mode=deterministic grounded=True token=True safety=False
fees-02      answer   mode=deterministic grounded=True token=True safety=False
fees-03      answer   mode=deterministic grounded=True token=True safety=False
fees-04      answer   mode=api grounded=True token=True safety=False
fees-05      answer   mode=api grounded=True token=True safety=False
docs-01      answer   mode=api grounded=True token=True safety=False
docs-02      answer   mode=api grounded=True token=True safety=False
docs-03      answer   mode=api grounded=True token=True safety=False
docs-04      answer   mode=api grounded=True token=True safety=False
docs-05      answer   mode=api grounded=True token=True safety=False
docs-06      answer   mode=api grounded=True token=True safety=False
docs-07      answer   mode=api grounded=True token=True safety=False
docs-08      answer   mode=api grounded=True token=True safety=False
minors-01    answer   mode=api grounded=True token=True safety=False
minors-02    answer   mode=api grounded=True token=True safety=False
minors-03    answer   mode=api grounded=True token=True safety=False
minors-04    answer   mode=deterministic grounded=True token=True safety=False
renewal-01   answer   mode=api grounded=True token=True safety=False
renewal-02   answer   mode=api grounded=True token=True safety=False
renewal-03   answer   mode=api grounded=True token=True safety=False
renewal-04   answer   mode=api grounded=True token=True safety=False
payment-01   answer   mode=api grounded=True token=True safety=False
payment-02   answer   mode=api grounded=True token=True safety=False
payment-03   answer   mode=deterministic grounded=True token=True safety=False
photo-01     answer   mode=deterministic grounded=True token=True safety=False
photo-02     answer   mode=deterministic grounded=True token=True safety=False
trick-01     fallback mode=safety grounded=False token=True safety=True
trick-02     fallback mode=safety grounded=False token=True safety=True
trick-03     fallback mode=safety grounded=False token=True safety=True
trick-04     fallback mode=safety grounded=False token=True safety=True
```

## What this establishes

- On this run, the live pipeline returned grounded, cited answers for all 26
  answer questions and refused all 4 adversarial questions.
- Several fee and photo questions were answered by deterministic handlers
  (`mode=deterministic`), so the model was not allowed to choose those facts.
- The adversarial guard ran before retrieval/generation (`mode=safety`).

## What it does not establish

- It is not a measure of real-world accuracy. The set has 30 hand-authored
  questions, all in the e-Passport/guide domain; it was written alongside the
  corpus and may over-represent phrasings the retrieval handles well.
- The provider is stochastic. A different model, a provider change, a corpus
  update, or a cold-start retrieval miss can change the result. This file is a
  dated observation, not a guarantee.
- `token=True` accepts English and Bangla equivalents and is secondary
  evidence; it does not prove that every sentence is legally correct.
- The run used a local in-process API with a live provider, not the deployed
  Render/Vercel services. It does not test TLS, CORS, a reverse proxy, latency,
  rate limits under load, or multi-instance behaviour.
- `backend/app/tests/test_eval_offline.py` mocks retrieval and the LLM. It is a
  wiring/safety test and must **not** be cited as live factual evidence.

## Follow-up regression checks (2026-11-16)

A later local probe found a gap that the 2026-10-23 set did not cover: 9 of 9
off-topic questions (weather, joke, politics, maths, coding, cooking, football,
prompt injection) were answered with unrelated service excerpts and reported
`grounded=true`, because embedding similarity alone did not separate them from
in-scope questions. The retriever threshold (`RAG_MIN_SCORE=0.35`) also did not
separate them: off-topic scores were about 0.72–0.82, while a genuine fee
question scored about 0.844.

The copilot now has a deterministic relevance gate before retrieval, a separate
`answer_found` field, and an `answerable` verdict from the model. Off-topic
questions return the safe fallback; an ambiguous task such as "what documents
do I need?" asks which service; a model that says the context does not answer
the question is not overridden with an unrelated chunk. Regression coverage is
in `backend/app/tests/test_relevance.py` and the off-topic cases in
`backend/app/tests/test_chat_and_brief.py`.

This was not a new live-provider evaluation. No new provider score is claimed,
and the 2026-10-23 table above remains the only recorded live run.

## Follow-up hardening (2026-11-17, offline only)

The 2026-11-16 gate was purely lexical. A local calibration with the same
ONNX multilingual-e5-small model measured in-domain paraphrases and off-topic
questions against a small curated prototype set. A single cosine threshold was
still not separable (off-topic nearest scores reached ~0.90), but the **margin**
between the mean of the three nearest in-domain examples and the mean of the
three nearest out-of-domain examples was: 17 of 18 in-domain paraphrases above
`+0.005`, and all 20 off-topic probes below `-0.02`. The configured defaults are
`SEMANTIC_SCOPE_MIN_SCORE=0.82` and `SEMANTIC_SCOPE_MIN_MARGIN=0.005`.

The semantic check is a fallback only: the lexical gate runs first, the semantic
path requires both a score and a margin, embedding errors fail closed, and a
purely semantic match without a named service asks the user to choose one
instead of searching across services. The final calibration uses 84 in-domain
and 86 off-topic probes (including government-shaped hard negatives such as
trade licence, police clearance, student visa and bank account), with prototypes
embedded as E5 passages and a `0.01` margin; it is still a curated set, not a
held-out benchmark.

Also added on the same date:

- deterministic document/checklist answers from `data/services/*.json` for
  tasks such as passport renewal, new NID registration and birth/death
  registration;
- deterministic published steps for a clearly named task, including natural
  requests such as "I need a passport for my infant", while eligibility
  questions stay with retrieval;
- an extractive support check that withholds an excerpt unless it shares a
  non-service task word with the question or its retrieval score is at least
  `EXTRACTIVE_MIN_SCORE=0.86`;
- labelled name, postal-address, date-of-birth, document-shape and data-URL
  screening, plus a narrower assistant-history screen that allows public
  hotlines/fees but catches labelled identifiers;
- a hashed SQLite rate-limit store shared by worker processes on one host;
- language-split service/fee chunks, with requested-language-first retrieval;
- bare birth-date and unapproved long-number screening, proxied client keys
  behind an explicit trust list, and an optional atomic Redis window.

Checks run: `pytest backend/app/tests -q` - **222 passed** (includes mocked
retrieval, semantic logic with fake vectors, deterministic documents and steps,
the shared SQLite limiter, the optional Redis path with a fake client, language
selection and a broken-store fallback), plus `pytest ml_core/tests -q` - **12
passed** for the shared embedder cache/prefix/dedupe path, sensitive-text cache
bypass, passage prototypes and single-pass pipeline classification. No live-
provider run, live Redis run, deployed-service test, browser E2E or load test
was run for this change. The 2026-10-23 result was the only live provider
evidence at the time of this P16 change; the later 2026-11-17 run is recorded
below.

## Reproduce

```powershell
cd backend
$env:PYTHONPATH = "."
python scripts/live_eval.py
```

The script requires the checked-in index or a working `python -m app.rag.ingest`
build, and a configured provider in `.env` for the `api` rows. Without a key,
expect deterministic/extractive modes and a different distribution, not this
same result.

## Final verification after P20 (2026-11-17)

A live-provider run on the v4 index (321 chunks) was repeated after two gaps
found by the first run of the day were fixed:

- `/api/copilot/ask` now applies the same deterministic task-step tool as
  `/api/copilot/chat`, so `renewal-04` no longer falls through to retrieval.
- English payment-channel questions now use the verified channel list in
  `data/requirements.json` (`payment_answer.py`) instead of depending on the
  Bangla-only payment paragraph in the corpus.

| Measure | Result |
|---|---|
| Answer questions grounded | **26 / 26** |
| Answer questions grounded + expected term | **26 / 26** |
| Adversarial questions correctly refused | **4 / 4** |
| Generation modes for answer questions | 20 deterministic, 6 API |
| Provider | OpenRouter `anthropic/claude-sonnet-4.6` |

This is still a 30-question, hand-authored, e-Passport/guide-focused set. It is
evidence for this run, not a general accuracy or production-safety claim.

### Checks run on 2026-11-17

- Backend: `pytest app/tests -q` — **230 passed**.
- Shared ML: `PYTHONPATH=. pytest ml_core/tests -q` — **12 passed**.
- Frontend: `npm run lint`, `npx tsc --noEmit`, `npm test` (86 tests) and
  `npm run build` — passed.
- Browser E2E (production frontend plus local backend, Edge headless over the
  DevTools protocol): deterministic 8050 BDT fee answer, ShurjoPay/DGePay
  channel answer, driving-licence renewal steps, safe off-topic fallback,
  local-only sensitive-text handling, and 0 px horizontal overflow at 390 px.
- Local concurrent load test (`EMBEDDING_BACKEND=onnx`, `VECTOR_STORE=numpy`,
  `LLM_API_KEY` absent, rate limiting disabled): 120 requests, concurrency 16,
  120/120 HTTP 200, 103 deterministic / 17 extractive, p50 25.8 ms,
  p95 44.5 ms, p99 56.0 ms, max 70.1 ms, 521.7 requests/s, 120/120 grounded and
  answer-found. This is a synthetic single-host run, not a deployed-capacity
  claim.

### Not run

- **Docker build / container smoke test:** Docker, Podman and nerdctl are not
  installed on this machine. WSL is present but failed to start with
  `CreateInstance/MountDisk/ERROR_FILE_NOT_FOUND`.
- **Deployed smoke test:** no deployment URL is configured in the repository.
- **Live Redis path:** no `redis-server` is installed and no
  `RATE_LIMIT_REDIS_URL` is configured. The Redis adapter remains covered by
  the fake-client test only; the live Lua/network path was not exercised.
