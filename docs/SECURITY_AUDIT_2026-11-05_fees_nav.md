# Security self-audit — verified fees, status-guide removal, homepage cleanup (2026-11-05)

## Data flows and trust boundaries

- **Fee catalog (`data/fee_schedules.json`)**: public, non-sensitive labels, amounts, source URLs and verification dates. It is served by `GET /api/fee-schedules`; the amount calculation stays in the browser. No new input field, identifier or free-text value was added. The four new services ask only for a category (e.g. "new registration within 45 days") and carry no personal data.
- **Status-guide page removed**: `/services/[serviceId]/status`, its nav entry and the service-overview card were deleted. The backend guidance endpoint and `data/guidance/` remain because the fraud-shield card and deterministic copilot status answers use them. The removed page had no input fields, so removing it cannot add a data flow.
- **Homepage helper-tools grid removed**: presentational only. Navigation and hero CTAs still reach every tool. No data flow changed.
- **Locale changes**: `home.tools_*` and the page-specific `status_guide` block were deleted; shared share/print strings moved to `service_guide`. Both `bn` and `en` keep every key used by the guide page.
- **Fee sources**: all four `source_url` values use `https` and are rendered in the fee page with `target="_blank" rel="noopener noreferrer"`. Amounts are static data, never model output.

## Abuse cases considered

- A user cannot influence a fee amount, because selection values come from fixed option lists validated on both client and server (`VALIDATION_ERROR` for unknown parameter or option).
- Removing the status page removes a public route but not an authentication or rate-limit control; no privileged action was reachable there.
- The new fee rules contain no free-text or number input, so there is no new injection or enumeration surface.
- The verified NID/birth/death/land sources contain public fees only; no identity numbers were entered, requested, logged or stored while verifying them.

## Findings

- **Critical/High**: none.
- **Medium**: none.
- **Low**: the NID fee amounts are published in the Election Commission fee calculator, which asks for an NID before showing an amount. To avoid entering identity data, the amounts recorded here were cross-checked on the government Teachers' Portal and in the public fee guidance; the catalog's scope note tells users the calculator is the final authority and the app never asks for an NID.
- **Low**: `verify:intake` no longer covers the deleted status page; the fraud-shield and fee-estimator checks remain.

## Checks run

- Backend: `python -m pytest backend/app/tests -q` — 169 passed.
- Frontend: `tsc --noEmit` clean; `npm test` — 86 passed; `npm run lint` — warnings only; `npm run build` — passed (10 routes; the status route is gone).
- Index rebuild after the fee-data change: `python -m app.rag.ingest --rebuild` — 155 chunks indexed.

## Not run

- Browser E2E (`verify:intake`, `verify:privacy`) — no desktop browser was connected to the session. The status-guide assertions were removed rather than left pointing at a deleted route.
- `ml_core/` was not modified.
