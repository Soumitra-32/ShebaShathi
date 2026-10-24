# Privacy and local-processing map

> Scope: the AI intake (`/#intake`), the complaint drafter (`/grs`), the document consistency check (`/identity-check`) and the fee checker (`/redflag`).
> Rules for this behaviour live in `docs/SECURITY_ASSESSMENT.md` §3.1.1.

## What runs where

| Task | Where it runs | Library / model | Network |
|---|---|---|---|
| AI intake routing | Backend, then optional LLM | `backend/app/intake/engine.py`: validated catalog + deterministic Bangla/English/Banglish keyword fallback; optional OpenAI-compatible classifier | `POST /api/intake`; if configured, the description is sent to the provider for classification only |
| Conditional checklist | Backend | `backend/app/services/engine.py` from validated `data/services/*.json` | `POST /api/services/{id}/checklist` |
| Complaint drafting (template + validation) | Browser | `frontend/lib/local/complaint.ts` (deterministic, no model) | none |
| Voice input (dictation) | Browser | `@huggingface/transformers` + `onnxruntime-web` (WASM), Whisper `onnx-community/whisper-base`, served from `/models/` | model files only, from this project's own origin |
| Attachment reading (OCR) | Browser | `tesseract.js` + `tesseract.js-core` (WASM), language data from `/tessdata/` (`ben`, `eng`) | model files only, from this project's own origin |
| PDF text layer | Browser | `pdfjs-dist` (worker from `/pdf/`) | none |
| Scanned PDF pages | Browser | `pdfjs-dist` renders the page to a canvas, then local OCR reads it | none |
| Identity field comparison | Browser | `frontend/lib/local/compare.ts` (deterministic) | none |
| Fee calculation and comparison | Browser | `frontend/lib/fees.ts` + `data/fee_schedules.json` | the public fee catalog only |

## Sensitive data flows

### AI intake
```
free text (React state)
      │
      ├─► POST /api/intake ─► rate limit ─► identity-number rejection (shape check)
      │                                               │
      │                                               └─► reject 422; no provider/retrieval call
      │
      ├─► optional LLM classifier ─► validated service/task + declared answers only
      │        (description sent to provider if LLM_API_KEY is set)
      │
      └─► deterministic keyword router (no provider) ─► validated service/task
                                                          │
                                      missing questions ◄─┘
                                                  │
                         POST /api/services/{id}/checklist (validated catalog facts)
```
The description is held in component state for the current page only. The application does not write it to `localStorage`, `sessionStorage`, a cookie, a database or a log; the POST response is not cached by the API client. The UI asks users not to paste NID, passport, phone or OTP numbers. If an LLM key is configured, the description **is** sent to that provider for classification; the provider is not sent retrieved documents or checklist output. Identity-number rejection is heuristic, not a guarantee.

### Complaint drafting
```
user text ──► React state ──► findMissingDetails() ──► buildDraft() ──► on-screen draft
                    │                                        │
                    └──► no fetch, no storage               └──► copy / print only
```
The complaint text, dates, office names and descriptions never leave the page. The backend endpoint `/api/grs/draft` still exists for API callers, but the page no longer calls it.

### Voice input
```
microphone ──► MediaRecorder ──► Web Audio decode + 16 kHz resample ──► Whisper (WASM, local)
                                                                              │
                                                            transcript ───────┘
                                                                     └─► editable text box
```
The audio and the transcript stay in memory. The browser's Web Speech API is **not** used, because some implementations stream the audio to a remote recognition service.

### Attachments and OCR
```
File ──► magic-byte + size check ──► pdf.js text layer  (text PDF)
                                     └► canvas render ──► tesseract.js  (scanned PDF or image)
                                                              │
                                                       extracted text
                                                              │
                                                  shown to the user, unconfirmed
```
The user decides whether the extracted text is quoted in the draft.

### Document comparison
```
File ──► local extraction ──► suggested values (unconfirmed) ──► user confirms/edits
                                                                      │
                                                          compareFields() (local)
                                                                      │
                                                          status per field
```
Statuses are `মিলেছে / মিলেনি / তথ্য পাওয়া যায়নি / যাচাই প্রয়োজন`. The tool compares text only; it never states that a document is genuine or which value is legally correct.

### Fee checking
```
GET /api/fee-schedules ──► browser (public labels, amounts, source URLs, dates)
                                       │
                        claimed amount ─┴─► calculateFee() ──► breakdown + difference (local)
```
The claimed amount is never sent. The catalog contains no personal data.

## External requests that remain

| Request | Why | Contains user data? |
|---|---|---|
| `POST /api/intake` (backend) | map a short situation description to a service/task and return missing questions | yes: the description in the request body. The application does not persist or log it; identity-like numbers are rejected before routing |
| `POST /api/intake` → optional LLM provider | only when `LLM_API_KEY` is set: classify the description into one enabled service/task and declared answers | yes: the description after the heuristic identity-number check. No retrieved documents or checklist data are sent |
| `GET /api/fee-schedules` (backend) | the verified public fee catalog | no |
| `GET /api/services`, `/api/services/{id}`, `/api/fees/calculate`, `/api/checklist` (existing pages) | existing public guide data and deterministic fees | no |
| `GET /models/**`, `/tessdata/**`, `/tesseract/**`, `/pdf/**`, `/ort/**` (this origin) | self-hosted OCR/speech runtime and models | no |
| `POST /api/copilot/ask` → optional LLM provider (OpenRouter / OpenAI) | only when `LLM_API_KEY` is set: the question and the retrieved source excerpts are sent to the configured provider to write a grounded answer | the question only — never a document, OCR text, transcript, complaint text or extracted identity value. Do not paste identity data into the copilot |

Nothing else is contacted. There is no analytics, session-replay or crash-reporting script in the project.

## Storage

* Intake text and answers live only in React state and the request/response of the current page; they are not put in browser storage and the POST response is not cached.
* No sensitive value is written to `localStorage`, `sessionStorage`, `IndexedDB`, cookies or a service-worker cache.
* The API client caches **GET** responses only (public guide data and the fee catalog) and never a request body.
* Object URLs for previews are revoked when a file is removed, the workflow is reset, or the page is unloaded.
* The OCR worker and the speech model are released when they are no longer needed.

## Limitations that remain

* Identity-number rejection is shape-based and conservative. It can miss an unusual format and may occasionally reject a legitimate long number. Users are told not to paste identity data; the application must not be treated as a guarantee that free text is anonymous.
* When `LLM_API_KEY` is configured, the AI intake sends the description to that provider. Leave the key unset to keep intake fully local to the backend and deterministic; the copilot then uses cited extractive answers.
* The AI intake can misclassify an ambiguous sentence. It asks the user to choose a service/task instead of silently guessing, and all documents, fees and rules still come from validated data.
* Browser-local processing stops **this application** from uploading your data. It does not protect against a compromised device, a malicious browser extension, or malicious application code.
* OCR quality depends on the scan. Extracted values are always shown unconfirmed so a wrong reading is visible.
* Whisper `whisper-base` is a small model: Bangla dictation is usable but not perfect, and the transcript is editable before use.
* The fee catalog only contains schedules that were verified against an official page on a recorded date. Everything else is marked "manual verification required" and shows the official portal instead of a number.
* No deployment URL, mobile device test or third-party penetration test is claimed.

## Verifying it yourself

```powershell
cd frontend
npm ci
npm run fetch-models        # one-time: OCR language data + Whisper model
npm run dev
```

Then open the browser's Network panel, complete the three workflows and confirm that no request carries a document, transcript, complaint text or claimed amount. Two scripted checks do the same thing automatically:

```powershell
python scripts/make_local_fixtures.py     # synthetic PNG + text PDF fixtures
cd frontend
npm run verify:local      # OCR and PDF extraction with the shipped assets
npm run verify:privacy    # headless Chrome: no sensitive value leaves the browser
npm run verify:intake     # headless Chrome: intake states, PII rejection, mobile nav
```
