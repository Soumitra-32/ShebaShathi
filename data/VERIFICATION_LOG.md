# Verification Log

Official-source checks performed on 2026-10-15. Fee instructions report an update of 2026-07-12; application instructions report an update of 2026-08-03.

| Date checked | Item | Official source | Result recorded |
|---|---|---|---|
| 2026-10-15 | Domestic e-Passport fees, all 48/64-page × 5/10-year × regular/express/super-express combinations | https://www.epassport.gov.bd/instructions/passport-fees | Recorded all 12 listed totals in `fees.json`. The page says listed fees include 15% VAT; no separate service charge is shown. |
| 2026-10-15 | Delivery estimates | https://www.epassport.gov.bd/instructions/passport-fees | Regular: 15 working days / 21 days; express: 7 working days / 10 days; super express: 2 working days, from biometric enrolment. |
| 2026-10-15 | Payment channels | https://www.epassport.gov.bd/instructions/passport-fees | Online A-Challan, DGePay, ShurjoPay; offline A-Challan at government or private banks. |
| 2026-10-15 | Identity document by age, parental NID, under-18 validity/pages, address office, technical certificates, lost-passport GD/copy, and under-six photo | https://epassport.gov.bd/instructions/instructions | Recorded the page's age bands: under 18 uses English BRC; ages 18–20 may use NID or English BRC; over 20 requires NID. Under-18 applicants without their own NID must provide a parent NID number and receive a 5-year, 48-page passport. Relevant technical certificates, original previous passport for re-issue, GD and previous-passport photocopy for lost passports, and a 3R grey-background lab photo for children under six are included only for the cases stated by the source. |
| 2026-10-15 | New/re-issue application form fields | https://www.epassport.gov.bd/api/v1/registrations/download-offline-form | Form fields should match the applicant's NID or Birth Registration Certificate and include previous-passport fields where applicable. |
| 2026-10-15 | Citizen GRS complaint form and complaint scope | https://www.grs.gov.bd/complainWithoutLogin.do | Confirmed a citizen complaint form with service/office, subject and description fields, and the grievance redress officer designation used in the draft. |

## Multi-service checks (2026-10-17)

Service contract files under `data/services/` were authored from these official pages, checked on 2026-10-17. Where a fee or exact requirement was not stated on a reachable official page, it was left to the official portal rather than stated here.

| Date checked | Item | Official source | Result recorded |
|---|---|---|---|
| 2026-10-17 | NID new registration document list (printed online form, age proof, residence proof, citizenship certificate, parents'/spouse's NID) and three-step application | https://services.nidw.gov.bd/nid-pub/faq?tab=faq-register | Encoded in `data/services/nid.json` (`new_registration`). |
| 2026-10-17 | NID correction evidence, single-correction rule, and re-issue vs. correction ordering | https://services.nidw.gov.bd/nid-pub/faq?tab=faq-correction | Encoded in `data/services/nid.json` (`correction`, `reissue`); fee amounts left to https://services.nidw.gov.bd/nid-pub/fees. |
| 2026-10-17 | BRTA learner, smart card, renewal, and duplicate licence documents plus listed fees (learner 345/518; smart card professional 1,438 / non-professional 2,300; renewal 2,185/1,323; duplicate 633; +200/year late) | https://bsp.brta.gov.bd/drivingLicense | Encoded in `data/services/driving_licence.json`; final amounts referred to https://bsp.brta.gov.bd/feeCalculator. |
| 2026-10-17 | BDRIS birth registration, correction, reprint, cancellation, verification, and status routes | https://bdris.gov.bd/ | Task routes and official links encoded in `data/services/birth_registration.json`. |
| 2026-10-17 | Birth registration document lists (under-5 vs. over-5 proof, permanent-address proof, correction evidence) and 45-day free window | https://bdris.dscc.gov.bd/ | Encoded in `data/services/birth_registration.json`. Late-registration fees left to the official portal. |
| 2026-10-17 | Death registration new-registration and correction document lists (proof of death, deceased's birth record, applicant identity, guardian proof) | https://bdris.dscc.gov.bd/dr/application.html | Encoded in `data/services/death_registration.json`. |
| 2026-10-17 | Death registration certificate reprint, verification, and application routes; Rule 11(4) document list; free within 45 days | https://bdris.gov.bd/dr/application and Birth and Death Registration Rules, 2018 (https://orgbdr.gov.bd/pages/static-pages/6922df21933eb65569e20100) | Task routes and warnings encoded in `data/services/death_registration.json`. |

### Blocked or unreached pages

- `https://orgbdr.gov.bd` returned transport errors and `https://bdris.gov.bd/br/*` / `www.bdris.gov.bd/br/application` returned HTTP 403 during checking. Birth/death fee specifics beyond the verified 45-day free window were therefore not recorded; the guides direct users to the official portal.

## Fee schedule catalog (2026-10-20)

`data/fee_schedules.json` is the single multi-service catalog used by the fee checker. Every entry carries its official source URL, the date it was last checked, and the conditions that apply. The e-Passport rows are kept byte-consistent with `data/fees.json` by a regression test.

| Date checked | Item | Official source | Result recorded |
|---|---|---|---|
| 2026-10-15 | Domestic e-Passport fees (48/64 pages × 5/10 years × regular/express/super express) | https://www.epassport.gov.bd/instructions/passport-fees | All 12 totals recorded in `data/fee_schedules.json` with the 15% VAT split and the delivery estimate per combination. Reused unchanged from the earlier check. |
| 2026-10-17 | BRTA driving-licence fees: learner category 1 BDT 345 and category 2 BDT 518; smart card professional BDT 1,438 and non-professional BDT 2,300; renewal within 15 days of expiry non-professional BDT 2,185 and professional BDT 1,323; duplicate (high-security card) BDT 633; BDT 200 per year after the 15-day window | https://bsp.brta.gov.bd/drivingLicense | Recorded as seven fee rules plus one per-year late component. The official fee calculator (https://bsp.brta.gov.bd/feeCalculator) remains the authority for the final amount. |
| 2026-10-20 | NID fee schedule | https://services.nidw.gov.bd/nid-pub/fees | Page reachable, but the amounts were not read and verified in this pass, so the service is listed as **manual verification required** and shows no number. |
| 2026-10-20 | Birth registration fees | https://bdris.gov.bd/ | Portal reachable; no fee schedule was verified, so the service is listed as **manual verification required**. |
| 2026-10-20 | Death registration fees | https://bdris.gov.bd/ | No fee schedule was verified, so the service is listed as **manual verification required**. |
| 2026-10-20 | Land mutation fees | https://land.gov.bd/ | No single official fee schedule with identifiable conditions was located, so the service is listed as **manual verification required**. |

## Local processing models and libraries (2026-10-20)

| Item | Source | Version / size | Notes |
|---|---|---|---|
| OCR engine | `tesseract.js` + `tesseract.js-core` (npm) | tesseract.js 6.0.1 | Worker and WebAssembly core copied into `frontend/public/tesseract/` by `npm run postinstall`; no CDN at runtime. |
| OCR language data | tessdata_fast `ben` and `eng` | ben 539 KB, eng 1.9 MB (gzipped) | Downloaded by `npm run fetch-models` into `frontend/public/tessdata/`; processed on the device. |
| PDF parsing | `pdfjs-dist` (npm) | 4.10.38 | Worker, character maps and standard fonts copied into `frontend/public/pdf/`; used for the text layer and for rendering scanned pages to a canvas. |
| Speech recognition | `@huggingface/transformers` + `onnxruntime-web` (npm) | transformers.js 4.3.1 | Runs in the browser through WebAssembly; single-threaded so no cross-origin isolation headers are required. The ONNX runtime files are copied into `frontend/public/ort/` and the CDN default is replaced, so nothing is fetched from a third-party host. Upgraded from 3.8.1 because `npm audit` reported high-severity advisories in the Node-only `sharp`/`onnxruntime-node` dependencies of the older release; after the upgrade `npm audit --omit=dev` reports 0 vulnerabilities. |
| Speech model | `onnx-community/whisper-base` (Hugging Face) | encoder 22.1 MB + decoder 51.2 MB (int8) | Downloaded by `npm run fetch-models` into `frontend/public/models/`; served from this project's own origin. `whisper-tiny` is available with `--model whisper-tiny`. |

## Scope notes

- The checklist summarizes verified instructions and directs applicants to the official portal for other situation-specific requirements.
- No blanket claim is made that cash is never accepted, that attestation is never needed, or that every applicant needs the same documents.
- Fee amounts cover applications inside Bangladesh as shown on the linked fee page. Mission fees are not included.
- The fee catalog deliberately contains no amount that was not read on an official page. Services marked "manual verification required" show the official portal instead of a number.
