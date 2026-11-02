# TASKS.md — open work (priority order)

Status as of 2026-10-30. Phases 0–10 in `docs/PLANNER.md` are implemented except where listed. Pick one task, follow `AGENTS.md`, and tick it here when done.

## P0: Security and hygiene
- [ ] T-01 **Rotate the exposed OpenRouter key** (it was in a shared zip). Add a pre-share script or checklist that excludes `.env`.
- [ ] T-02 Add `.dockerignore` at repo root and trim the zip: exclude `.tmp-test/`, `.chroma/`, caches. Confirm `.gitignore` covers them (it does).
- [ ] T-03 Make `docs/SECURITY_ASSESSMENT.md` agent-neutral (remove the named agent).

## P1: Docs that agents rely on
- [ ] T-04 Correct `docs/PLANNER.md` to match reality: embeddings = `intfloat/multilingual-e5-small`; PDF = browser print with local Noto Sans Bengali (no jsPDF); i18n = `locales/*.json` with `react-i18next`; tests live in `backend/app/tests/`; `/fees` merged into `/redflag`; tick Phases 0–4 where done; add Phase 10 status.
- [ ] T-05 Repair `DECISIONS.md`: move the 2026-10-21 "Bug fix & feature improvements" row into the table; replace stale "Open Questions".
- [ ] T-06 Finish the README "Project documentation" section (link PLANNER, SECURITY_ASSESSMENT, PRIVACY, DEPLOYMENT, DEMO_SCRIPT, UX_CHECKS, EVAL_RESULTS, and the five new files). Align `.env.example` provider defaults with the README (OpenRouter vs OpenAI).

## P2: Quality
- [ ] T-07 **Multi-service eval set** (PLANNER P8-2): add ≥6 questions each for birth, NID, driving licence, death registration, plus cross-service trick questions; extend `live_eval.py` and `test_eval_offline.py`.
- [ ] T-08 Refactor `copilot_ask` out of `main.py` into `rag/` (pure move, tests unchanged); consider `APIRouter` modules.
- [ ] T-09 Backend lint/type tooling (ruff + mypy config) and a CI workflow running pytest, `next lint`, `tsc`, `vitest`, `next build`, `npm audit --omit=dev`.
- [ ] T-10 Replace the process-local rate limiter with a shared store before multi-instance deploy (Redis), or document single-instance deploy as a requirement in `docs/DEPLOYMENT.md`.

## P3: Data
- [ ] T-11 Verify NID, birth registration and death registration fee schedules on official pages, then add them to `data/fee_schedules.json` with dates. Until verified, they stay "manual verification required".
- [ ] T-12 Source refresh: all guides were last verified 2026-10-15/17. Re-verify before 2027-04-13 (180-day window) and after any official notice.

## P4: Product polish (only if time)
- [ ] T-13 Lighthouse mobile run and record results (never invent scores) in `docs/UX_CHECKS.md`.
- [ ] T-14 Deploy (Vercel + Render/Fly), smoke test public URLs, record the backup demo video (`docs/DEMO_SCRIPT.md`).
- [ ] T-15 Tighten CSP (nonces instead of `'unsafe-inline'` scripts) if Next.js configuration allows it.

## Do not do
Add accounts or databases; collect identity numbers or document uploads server-side; submit applications; call cloud OCR or speech; present unverified fees or stats as fact.