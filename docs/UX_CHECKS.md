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

Not checked: a physical phone, iOS Safari, a screen reader, throttled-network
banners, Bangla PDF export, and Lighthouse. The dev-only Next.js indicator is
visible in headless screenshots but is not part of a production build.

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
