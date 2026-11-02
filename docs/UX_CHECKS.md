# UX check notes (PLANNER §13.3) — 2026-10-17, local run

> No Lighthouse score is claimed: no public URL or lab run was available in
> this environment, so no number is stated here (PLANNER §0 rule 8).

## What was verified locally

- `npm run lint`: no errors (the pre-existing `react-hooks/exhaustive-deps` warnings remain). `npm run build`: clean.
- Service directory/overview/guide render `last_verified` + review badge;
  `/copilot` shows citation title/URL/date/quote; `/identity-check` keeps typed
  values in component memory (no API/storage/logging by construction).
- 375px viewport: all service pages use `max-w-3xl/5xl`, `grid gap-4
  sm:grid-cols-2`, and `min-h-11` touch targets; guide checklist prints via the
  `@media print` block with Noto Sans Bengali.

## AI intake and navigation (2026-10-23)

Checked with the backend on `http://localhost:8000` and `npm run dev` on
`http://localhost:3000`, using headless Chrome over the DevTools protocol at
1280×900 and 375×812. The repeatable command is `npm run verify:intake`
(20 checks, all passed). It uses only synthetic text and saves screenshots to
the OS temp directory.

- English success path: “My 5 year old child needs a passport and does not have
  a NID” → e-Passport / Child application, age 5 prefilled, own-NID question
  asked; selecting “No” builds a checklist with three documents and the
  official source date. A second run confirmed the same path in the live API.
- PII rejection: “My NID is 1234567890” shows a visible error and no checklist.
- Unsafe intent: a bribe request shows the blocked panel with a safe message.
- Network failure: blocking `/api/intake` in the browser shows a retryable
  error; the page does not crash and keeps no stale checklist.
- Ambiguous input: “hello” shows service choices instead of guessing.
- Global language switcher: exactly one `.nav-lang` button on the tested pages;
  switching updates `document.documentElement.lang`, and the intake copy
  changes. The mobile menu opens with `aria-expanded="true"`, exposes all links,
  and closes on Escape.
- 375px: home page had `scrollWidth - innerWidth = 0` (no horizontal overflow);
  nav showed the menu toggle. Mobile, home-desktop and guide screenshots were
  reviewed.
- Canonical guide: `#fee` estimator present; 48 pages / 5 years / regular
  returned BDT 4,025 (base 3,500 + VAT 525). `/wizard` returns a redirect to
  the guide.
- `npm test` 78 passed (7 files); backend `python -m pytest app/tests -q`
  127 passed; `npm run build` passed; `npm run lint` had warnings only.

## Status guide and fraud shield (2026-11-01)

Same setup and command (`npm run verify:intake`, now **27 checks, all
passed**). New assertions added to the earlier list:

- `/services/epassport/status` renders the verified guide: the SB-clearance
  status string with the SB/CSB/DSB explanation, the "Hello SB" follow-up
  action, the official helpline (16445 / 09666716445), the Special Branch source
  URL with its 2026 verification date, and the High Commission fraud warning.
- The status guide page contains **zero identity inputs** (no Application ID or
  date-of-birth field); it explains statuses and points to the official status
  page instead of collecting anything.
- The canonical guide renders the fraud-shield card next to the fee estimator
  (no agency is ever authorized; official-service notice with source links).
- Share/print: the status guide and checklist carry share buttons whose text is
  built only from public verified content, with print styles on both pages.
- Frontend `npm test` 90 passed (10 files); backend suite 141 passed; `npm run
  lint` warnings only (7 pre-existing); `npm run build` passed (11 routes).

Not checked: a physical phone, iOS Safari, a screen reader, throttled-network
banners, Bangla PDF export, and Lighthouse. The dev-only Next.js indicator is
visible in headless screenshots but is not part of a production build.

## Multi-turn copilot, AI brief, and sticker (2026-11-02)

Verified locally with the backend on `http://127.0.0.1:8000` and scripted HTTP
calls (no desktop browser was connected, so no new screenshots were captured):

- `GET /health` → `ai_ready: true`, 5 services, 137 indexed chunks, provider
  `openrouter`, model `anthropic/claude-sonnet-4.6`.
- `POST /api/copilot/chat` with “পাসপোর্ট হারিয়ে গেলে কী করব?” returned a
  grounded Bangla answer, three citations, `generation_mode: api`, and the
  Claude model id.
- A follow-up with browser-held history and an explicit service scope returned a
  grounded deterministic fee answer instead of losing the service context.
- `POST /api/services/epassport/checklist/brief` returned a grounded Bangla AI
  brief (`generation_mode: api`). When the provider was temporarily
  unaffordable, the same endpoint returned the deterministic brief with
  `grounded: true` and `generation_mode: extractive` instead of an error.
- `POST /api/copilot/chat` rejects an identity-like number with
  `422 IDENTITY_DATA_REJECTED` before retrieval or any model call (unit test).
- Markdown formatting from a model is stripped by the shared plain-text
  sanitizer; the UI renders answers with `whitespace-pre-wrap`.
- Sticker assets exist at `frontend/public/built-for-aignite-2026.png` and
  `frontend/public/built-for-aignite-2026-nav.jpg`; the navbar badge renders on
  every page and the hero badge on `/`.

Checks run: backend `pytest` 150 passed; frontend `npm test`, `npx tsc --noEmit`,
`npm run lint` (warnings only) and `npm run build` (see the final report for the
exact run). Not checked: a real mobile device, screen reader, live browser
screenshots after the last CSS change, and the deployed URL.



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
