# CONVENTIONS.md

## General
- Smallest diff that does the job. Reuse existing modules; no new dependencies without a stated reason, an `npm audit` / `pip` review, and a `DECISIONS.md` entry.
- Preserve each file's existing line endings (many files are CRLF; Windows is the primary dev OS). Do not reformat whole files.
- Never commit `.env`, `.chroma/`, `.tmp-test/`, `__pycache__/`, `node_modules/` or downloaded models.
- Commit/PR messages: `<task id>: <what> (<why>)`.

## Python (backend)
- Python 3.11+, type hints on public functions, `from __future__ import annotations` where already used.
- Pydantic v2 schemas; public request models use `extra="forbid"`, bounded lengths, enums and numeric ranges. Reject NaN/inf, whitespace-only strings and unsupported enum values.
- Business rules go in `engine/` or `services/`, not in `main.py`. New routes stay thin: validate, rate-limit, call a module, shape the response.
- Errors: raise `HTTPException` with generic messages; never include `str(exc)`, paths, prompts or keys. Do not log request bodies, prompts, questions or generated text.
- LLM calls: only through `llm.py`, with timeouts and bounded input; treat output as untrusted JSON and validate it. Citations come from stored chunk metadata, never from model-written URLs.
- Bangla strings: UTF-8, plain and polite; provide `*_bn` and `*_en` fields together.

## TypeScript / React (frontend)
- App Router, function components, strict TS; avoid `any` in new code.
- Render user, model and retrieved text as React text. **No `dangerouslySetInnerHTML`.** External links use `rel="noopener noreferrer"`.
- All strings go through `locales/bn.json` and `en.json` (add both). Default language `bn`.
- API access only via `lib/api.ts`. Never put secrets in `NEXT_PUBLIC_*`.
- Anything touching documents, voice, complaint text or claimed fee amounts lives in `lib/local/` and must not call `fetch`, write storage, add URL params, or log values. Revoke object URLs and terminate workers on reset/unmount.
- Mobile first (375px), large tap targets, visible loading, error and empty states, keyboard accessible, adequate contrast. Show "Source: <link>, verified <date>" next to every fee or rule and a persistent service label in guides and the copilot.
- Tailwind 3 utilities only; do not migrate to Tailwind 4.

## Data and corpus
- Edit `data/` or `corpus/` only from a reviewed official page. Record date, service, URL and what was checked in `data/VERIFICATION_LOG.md`.
- Corpus front matter is mandatory: `title`, `source_url`, `last_verified`, `language`, `section`, `service_id`. One authority per file.
- After any change: `python -m app.rag.ingest --rebuild`, then run the tests and evals.
- Never infer a fee or rule from a neighbouring service. Unknown means fallback plus the official portal.

## Wording rules for user-facing text
- Say "independent guide", never imply government affiliation.
- Never say verified, genuine, authenticated, secure or "completely private/offline" beyond what was actually verified.
- Never advise paying an intermediary or an unofficial fee; point to official channels and the GRS portal.
- Complaint drafts use only user-supplied facts, mark unknowns as `⟨…⟩` placeholders, and are labelled drafts.

## Docs
Append to `DECISIONS.md` as `| YYYY-MM-DD | task | change | why |`, inside the table. Keep README, `.env.example` and `docker-compose.yml` in agreement.