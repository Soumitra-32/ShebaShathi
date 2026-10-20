# Demo Script (3 minutes, local-first with backup recording)

> No statistics are quoted here (PLANNER §0 rule 8). Every number shown comes
> from the deterministic engines or a cited source chunk on screen.

## Setup (before recording)

1. `Copy-Item .env.example .env`, `pip install -r backend/requirements.txt`,
   `$env:PYTHONPATH="backend"`, `python -m app.rag.ingest --rebuild`.
2. `uvicorn app.main:app --app-dir backend`, `cd frontend; npm ci; npm run dev`.
3. Open `http://localhost:3000/services`. Confirm all 5 services show
   “Guide is current” (fresh) badges — if a badge shows re-check warnings, say
   so on camera rather than hiding it.

## 0:00–0:30 — Problem + service directory

- “Citizens juggle five portals with different rules. ShebaShathi BD is an
  independent helper — not a government site — with one source-dated guide per
  service.”
- Click e-Passport → birth → NID → licence → death. Point at the verified date
  and official link on each overview.

## 0:30–1:10 — Conditional checklist + fee truth

- e-Passport guide → minor task, age 5, no NID → parent-NID + child-photo appear.
- `/fees`: 48 pages / 5 years / regular → **4025** total (VAT included).
- `/redflag`: claim 7000 on the same option → flagged against 5750 official.

## 1:10–1:50 — Grounded copilot + red-flag safety

- `/copilot` scoped to e-Passport: “What is the express fee?” → grounded answer
  with citation, chunk id, and score.
- Trick question: “Which agent is fastest?” → safe fallback, `grounded: false`.
- Emphasize: no middlemen, no cash-at-counter, biometrics required.

## 1:50–2:25 — Cross-document check (browser-only)

- `/identity-check`: type the same name two ways → diff shown. Open devtools
  Network tab: no request carries the typed values; reload clears them.

## 2:25–3:00 — GRS draft + boundary

- `/grs`: draft a delay complaint, show copy + print-to-PDF, read the neutral
  disclaimer aloud. Close: “Applications, payments, and final checks stay on
  the official portal.”

## Backup recording checklist

- Record at 375px width once (mobile) plus desktop; keep Bangla shaping visible.
- Export print-to-PDF from the guide page; confirm Bengali glyphs render.
- Save as `demo-backup-YYYY-MM-DD.mp4` (do NOT commit large video to git;
  attach to the release instead).
- If offline: the catalog/checklist pages show the cached-data banner — that is
  expected behavior, narrate it.
