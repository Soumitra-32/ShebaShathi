# Demo Script (3 minutes, local-first with backup recording)

> No statistics are quoted here (PLANNER §0 rule 8). Every number shown comes
> from the deterministic engines or a cited source chunk on screen.

## Setup (before recording)

1. `Copy-Item .env.example .env`, `pip install -r backend/requirements.txt`,
   `$env:PYTHONPATH="backend"`, `python -m app.rag.ingest --rebuild`.
2. `uvicorn app.main:app --app-dir backend`, `cd frontend; npm ci; npm run dev`.
3. Open `http://localhost:3000` and `GET /health`. Confirm `ai_ready: true`,
   `index_count > 0`, and all 5 services show “Guide is current” (fresh)
   badges. If a badge shows a re-check warning, say so on camera.
4. Decide which intake mode to show. With `LLM_API_KEY` set, the badge reads
   “AI match”; without it, “Guided” uses the deterministic router. Both are
   honest demos; do not claim the AI mode is the only path.

## 0:00–0:25 — Problem + AI intake

- “Citizens juggle five portals with different rules. ShebaShathi BD is an
  independent helper — not a government site. Start by describing the problem
  in your own words.”
- Point at the home intake card immediately below the hero. Read the privacy
  line aloud: no NID, passport, phone or OTP numbers.

## 0:25–1:05 — From situation to verified checklist

- Type or use an example: “আমার ৫ বছরের ছেলের পাসপোর্ট লাগবে, ওর নিজের NID নেই”
  (or the English example).
- Show the detected service, task, and badge. The age is prefilled; the UI asks
  only the missing own-NID question. Answer “No” and build the checklist.
- Point at the parent-NID/child-photo documents, the official links, and the
  source verification date. Say: “The model only routed the request. Every
  document and rule comes from the validated service file.”
- Optional fallback beat: stop the provider or clear the key, repeat, and show
  the same deterministic result with the “Guided” badge.

## 1:05–1:35 — Source-dated guide + fee truth

- `/services` → e-Passport. Point at the verified date and official link.
- Guide → `#fee`: 48 pages / 5 years / regular → **BDT 4,025**
  (BDT 3,500 + 15% VAT BDT 525).
- `/redflag`: claim 7,000 on the same option → flagged against the official
  4,025. Emphasize that this calculation runs in the browser.

## 1:35–2:05 — Grounded copilot + safety

- `/copilot` scoped to e-Passport: “What is the express fee?” → grounded answer
  with citation, chunk id, and score.
- Trick question: “Which agent is fastest?” → safe fallback, `grounded: false`.
- Emphasize: no middlemen, no cash-at-counter, biometrics required.

## 2:05–2:30 — Cross-document check (browser-only)

- `/identity-check`: type the same name two ways → diff shown. Open devtools
  Network tab: no request carries the typed values; reload clears them.

## 2:30–3:00 — GRS draft + boundary

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
