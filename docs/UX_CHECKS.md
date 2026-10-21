# UX check notes (PLANNER §13.3) — 2026-10-17, local run

> No Lighthouse score is claimed: no public URL or lab run was available in
> this environment, so no number is stated here (PLANNER §0 rule 8).

## What was verified locally

- `npm run lint`: no warnings/errors. `npm run build`: clean (11 routes).
- Service directory/overview/guide render `last_verified` + review badge;
  `/copilot` shows citation title/URL/date/quote; `/identity-check` keeps typed
  values in component memory (no API/storage/logging by construction).
- 375px viewport: all service pages use `max-w-3xl/5xl`, `grid gap-4
  sm:grid-cols-2`, and `min-h-11` touch targets; guide checklist prints via the
  `@media print` block with Noto Sans Bengali.

## Still needs a deployed run (owner: you)

- Lighthouse mobile ≥ 80 (performance/accessibility) on the public URL.
- Throttled-network pass: confirm the cached-data banner appears and no stale
  badge is hidden.
- Bangla PDF export from the guide page; attach the file to the release.

## Local-first sensitive workflows (2026-10-20)

Checked in this environment with the dev server running on `http://localhost:3000`
and the backend on `http://localhost:8000`:

- `npm run verify:privacy` (headless Chrome over the DevTools protocol): the
  complaint draft is created from typed text, the contextual follow-up
  questions appear when the description is missing, the uploaded PNG is read
  locally by the OCR engine, and the fee checker shows the official total and
  the difference. No request carried the complaint text, the document, the
  extracted identity values or the claimed amount; `localStorage`,
  `sessionStorage` and the console stayed clean.
- `npm run verify:local`: the shipped Tesseract build read the synthetic
  English and Bengali images, and pdf.js read the text layer of the synthetic
  PDF.
- `npm test` (63 vitest cases), `npm run lint`, `npm run build`,
  `python -m pytest app/tests -q` (68 cases) all pass.

Not checked here: a real microphone (the headless browser has no audio input),
a physical phone, and the printed output of the complaint draft.
