# PLANNER.md — ShebaShathi BD (সেবা সাথী বিডি)

> **Audience:** AI coding agent (and human teammates).
> **Read this whole file before writing any code.** Follow the phases in order. Do not skip acceptance criteria.

---

## 0. AGENT OPERATING RULES (READ FIRST)

1. **Multi-service destination, phased delivery.** The current working MVP is e-Passport. The product roadmap expands it into a Bangladesh citizen identity and services helper covering birth registration, NID, e-Passport, and driving licences. Do not implement every service at once; follow §11 and finish one source-checked guide end-to-end before starting the next.
2. **No hallucinated facts.** Every factual claim shown to a user (fee, document, rule, eligibility, process, URL) MUST come from the verified data for that service or a retrieved RAG chunk with a `source_url`. Each rule and source must identify its service. If neither exists, return that service's fallback string in §8.
3. **Verify-before-trust.** Draft or `[UNVERIFIED]` content MUST be checked against the relevant issuing authority before being hardcoded. Record the check in `data/VERIFICATION_LOG.md` (date, service, URL, what was checked). Never present unverified requirements, fees, or deadlines as fact.
4. **Bangla first.** Default UI language is Bangla (`bn`), with English (`en`) toggle. All user-facing AI output defaults to plain, conversational Bangla.
5. **Deterministic where possible.** Fees, checklists, eligibility, and service routing rules are computed by code/configuration, NOT by the LLM. ML may classify intent and explain retrieved material; it must not invent requirements or make identity decisions.
6. **Privacy by default.** Never request or store NID/BRN/passport/licence numbers, document images, account credentials, or OTPs. Any cross-document comparison must run in the browser and discard entered values when the page is closed. Do not log PII or send it to the LLM, vector store, analytics, or backend.
7. **Ship a working demo early.** Preserve the working e-Passport product; then add one complete guide at a time: Birth Registration → NID → cross-document consistency helper → Driving Licence → optional Death Registration. Each phase ends in a runnable state.
8. **Never fabricate statistics** in the UI or pitch. Pitch stats are `[UNVERIFIED]` until sourced (see §12).
9. **Keep `ml_core/` untouched** unless the user explicitly changes that constraint.
10. **Security workflow is mandatory.** Before changing code, follow `docs/SECURITY_ASSESSMENT.md`; after implementation, perform and record its self-audit before reporting the work complete.
11. **Ask when blocked** on a decision not covered here; otherwise make the simplest choice, note it in `DECISIONS.md`, and continue.

---

## 1. PROJECT SUMMARY

| Field | Value |
|---|---|
| Name | ShebaShathi BD (সেবা সাথী বিডি) |
| Context | Hackathon / buildathon MVP |
| Problem | People struggle to understand identity-document requirements, service dependencies, corrections, and official next steps. |
| Current MVP | e-Passport (Bangladesh) |
| Target product | Independent Bangladesh identity and citizen-services helper: birth registration, NID, e-Passport, and driving licence guides. |
| Core promise | Clear, source-dated guidance and tailored preparation checklists in Bangla and English; official actions stay with the issuing authority. |
| Differentiator | Deterministic, service-specific rules + citation-grounded answers + privacy-preserving preparation tools. |

### Judging targets (maximize)
| Criterion | Weight | How we score |
|---|---|---|
| Problem & User Value | 12 | Real money saved per applicant; sourced stats |
| Solution & Innovation | 12 | Middleman Red-Flag Detector + GRS Auto-Drafter |
| AI & Technical | 10 | Citation RAG + hallucination guardrail + timestamped sources |
| UX & Readiness | 16 | Visual wizard, printable PDF checklist, fee breakdown, working deployed demo |

---

## 2. SCOPE

### 2.1 In scope (MUST)
- **F1 Fee & Timeline Calculator** (deterministic)
- **F2 Interactive Service Wizard** (decision tree → structured JSON profile)
- **F3 Custom Document Checklist + PDF export**
- **F4 Verified RAG Copilot** (Q&A with citations + guardrail)
- **F5 GRS Complaint Auto-Drafter** (Bangla letter + PDF/copy)

### 2.2 Roadmap (phased; not all part of current MVP)
- **R1 Birth Registration guide:** new registration, correction, reprint, cancellation, verification and status links where supported by verified official sources.
- **R2 NID guide:** new registration, correction, replacement/reissue, and related services. Eligibility and processes must be source-checked and date-stamped.
- **R3 Cross-document consistency helper:** optional, user-entered comparison of name/date/parent fields for birth record, NID, and passport. Run entirely in browser memory; describe it only as a consistency check, never identity validation.
- **R4 Driving Licence guide:** learner, first licence, renewal, duplicate, fees and tests, each as a distinct service path grounded in BRTA material.
- **R5 Death Registration guide:** optional later civil-record guide, after the first four service areas are stable.

### 2.3 Should-have (if time)
- **F6 Middleman Red-Flag Detector**: user pastes a message/price quote (e.g., "৳12,000 for express") → app compares to official fee and flags overcharge.
- Bangla ↔ English toggle polish, mobile-first layout, offline-safe cached fallback data.

### 2.4 Out of scope (DO NOT BUILD)
- Actually submitting applications, payments, or logging into government portals.
- Authenticating a person's identity, declaring a document genuine, making eligibility decisions on behalf of an authority, or implying government affiliation.
- Storing personal data (NID, BRN, passport/licence numbers, document copies). No user accounts and no database of PII.
- Scraping authenticated pages, bypassing OTP/CAPTCHA, or automating submissions.
- Services outside the roadmap without an explicit scope decision.

### 2.5 Current e-Passport scenarios (the wizard must branch on these)
| ID | Scenario | Key rules to cover (verify each) |
|---|---|---|
| S1 | First-time adult (18+) | NID-based application, address rules, office selection |
| S2 | Minor (<18) | English Birth Registration Certificate (17-digit), parent NID linkage, photo rules |
| S3 | Renewal / Re-issue | MRP → e-Passport conversion, lost/damaged passport (GD report), validity choice |

All rule text above is `[UNVERIFIED]` until populated in the e-Passport rule data with a `source_url`.

### 2.6 Cross-service user journeys
- Determine which document/service the user is trying to complete, then ask only the minimum non-sensitive questions required to select a checklist.
- Explain dependencies (for example, which identity record an application asks the user to follow) only when backed by current official sources.
- If names, dates, or parent details differ between documents, explain that the app cannot choose the legally correct value; link to the correction route for the relevant issuing authority.
- Always distinguish an information guide from official verification, application, payment, or complaint submission.

---

## 3. DATA CONTRACTS

### 3.1 `data/fees.json` — baseline (all values `[UNVERIFIED]` until checked)

Fee formula: `total = base_price + round(base_price * 0.15)` (15% VAT). Verify VAT rate and whether listed amounts already include VAT.

```json
{
  "currency": "BDT",
  "vat_rate": 0.15,
  "last_verified": null,
  "source_url": "https://www.epassport.gov.bd/instructions/passport-fees",
  "fees": [
    { "pages": 48, "validity_years": 5,  "delivery": "regular",       "total": 4025 },
    { "pages": 48, "validity_years": 5,  "delivery": "express",       "total": 6325 },
    { "pages": 48, "validity_years": 5,  "delivery": "super_express", "total": 8625 },
    { "pages": 48, "validity_years": 10, "delivery": "regular",       "total": 5750 },
    { "pages": 48, "validity_years": 10, "delivery": "express",       "total": 8050 },
    { "pages": 48, "validity_years": 10, "delivery": "super_express", "total": 10350 },
    { "pages": 64, "validity_years": 10, "delivery": "regular",       "total": 8050 },
    { "pages": 64, "validity_years": 10, "delivery": "express",       "total": 10350 },
    { "pages": 64, "validity_years": 10, "delivery": "super_express", "total": 13800 }
  ]
}
```

**Agent TODO:** Fetch the official fee page, reconcile every row, add any missing combos (e.g., 64 pages / 5 years, minors' validity limits, regular vs. express timelines in working days), set `last_verified` to the real date. If a combination is not officially offered, the UI must not offer it.

### 3.2 Payment facts `[UNVERIFIED]`
- Channels: A-Challan, DGePay, ShurjoPay, designated bank counters.
- Claim: no cash accepted at the passport office.
- Claim: no document attestation needed for e-Passport application.
Verify each; store in `data/requirements.json` with sources.

### 3.3 Service-specific rule data
Do not keep every future service's requirements in one passport-only scenario list. Use separate files or a validated service catalog, with a common contract and service-specific rule sets. Every user-facing rule must carry `service_id`, `source_url`, and `last_verified`.

```json
{
  "service_id": "birth_registration",
  "service_name_bn": "...",
  "service_name_en": "...",
  "source_url": "https://official.example/service",
  "last_verified": "YYYY-MM-DD",
  "scenarios": [{
    "id": "new_registration",
    "conditions": [{ "field": "applicant_relationship", "operator": "in", "value": ["self", "parent"] }],
    "documents": [{ "id": "...", "required": true, "label_bn": "...", "label_en": "...", "notes_bn": "...", "notes_en": "...", "source_url": "https://official.example/rule", "last_verified": "YYYY-MM-DD" }],
    "steps_bn": ["..."], "steps_en": ["..."],
    "official_links": [{ "label_bn": "...", "label_en": "...", "url": "https://official.example" }],
    "warnings_bn": [], "warnings_en": []
  }]
}
```

Use a JSON Schema or Pydantic model to validate this contract. Store fees and timelines only when verified; never infer them from neighboring service types. Keep common checklist rendering reusable, while each service owns its own scenarios and rules.

### 3.4 RAG chunk schema (vector store payload)
```json
{
  "id": "uuid",
  "text": "chunk text (~300 tokens)",
  "service_id": "epassport|birth_registration|nid|driving_licence|death_registration",
  "section": "fees|documents|eligibility|process|correction|verification|payment|grs",
  "source_url": "https://...",
  "source_title": "...",
  "language": "bn|en",
  "last_verified": "YYYY-MM-DD"
}
```

### 3.5 Initial official-source directory (verify each page before using a rule)
- e-Passport: `https://www.epassport.gov.bd/` and `https://dip.gov.bd/`
- Birth/death registration: `https://bdris.gov.bd/` and `https://everify.bdris.gov.bd/`
- NID / voter services: `https://ecs.gov.bd/` and the current NID service portal linked by the Election Commission.
- Driving licence: `https://bsp.brta.gov.bd/` and `https://brta.gov.bd/`
- GRS: `https://www.grs.gov.bd/`

These are starting points, not proof that a specific rule is current. Store the exact official page used for each rule and its review date.

### 3.6 Current e-Passport wizard profile (input to engine + RAG)
```json
{
  "applicant_type": "adult|minor|renewal",
  "age": 22,
  "pages": 48,
  "validity_years": 10,
  "delivery": "regular|express|super_express",
  "has_nid": true,
  "has_birth_reg_17digit": false,
  "lost_passport": false,
  "language": "bn"
}
```

---

## 4. ARCHITECTURE

```
Next.js (App Router, Tailwind, i18n)
        │  REST/JSON
        ▼
FastAPI backend ───────────────┬───────────────────────────┐
   │                           │                           │
Service Rule Engine      Service-filtered RAG         Optional Drafter
(fees, checklists,       (embed → Chroma             (GRS letter
 conditional guidance)    → service filter → cite)     generation)
                         verifier → answer)
        │                           │
        data/services/*.json     corpus/*.md (curated, cleaned, with metadata)
```

The model is not the policy engine. Route service intent with the existing ML components only when confidence is sufficient; otherwise ask the user to choose from the service catalog. Apply service metadata filtering before retrieval so answers cannot silently mix rules across authorities.

### Stack (decided; do not re-debate)
- **Frontend:** Next.js (App Router), Tailwind CSS, lucide-react, `i18next`, `jspdf` (+ a Bangla-capable font embedded, e.g., Noto Sans Bengali; verify PDF renders Bangla correctly).
- **Backend:** Python FastAPI.
- **Vector store:** ChromaDB (local, persisted to `./.chroma`) for MVP simplicity. Qdrant optional.
- **Embeddings:** multilingual model required (Bangla content). Use `BAAI/bge-m3` or an API multilingual embedding. Do NOT use English-only embeddings.
- **LLM:** any current strong model via API, selected through env var `LLM_MODEL`. Keep provider behind a thin adapter `llm.py`.
- **Deploy:** Frontend on Vercel (or equivalent), backend on Render/Railway/Fly. Provide `docker-compose.yml` for local run.

---

## 5. REPOSITORY STRUCTURE

```
shebashathi-bd/
├── docs/
│   ├── PLANNER.md
│   └── SECURITY_ASSESSMENT.md
├── DECISIONS.md
├── README.md
├── docker-compose.yml
├── .env.example
├── data/
│   ├── fees.json
│   ├── requirements.json
│   ├── grs_templates.json
│   └── VERIFICATION_LOG.md
├── corpus/                  # cleaned source text, one file per page + front-matter metadata
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── schemas.py
│   │   ├── engine/{fees.py,checklist.py,redflag.py}
│   │   ├── rag/{ingest.py,retriever.py,generator.py,verifier.py,prompts.py}
│   │   ├── drafter/grs.py
│   │   └── llm.py
│   ├── tests/
│   └── requirements.txt
└── frontend/
    ├── app/{page.tsx,wizard/,copilot/,grs/,fees/}
    ├── components/
    ├── lib/{api.ts,pdf.ts,i18n.ts}
    ├── locales/{bn.json,en.json}
    └── package.json
```

---

## 6. API SPEC

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/health` | none | `{status:"ok", data_last_verified}` |
| POST | `/api/fees/calculate` | `{pages, validity_years, delivery}` | `{base, vat, total, currency, source_url, last_verified, timeline_note}` |
| POST | `/api/checklist` | wizard profile (§3.5) | `{documents:[...], steps:[...], payment_channels:[...], warnings:[...]}` |
| POST | `/api/copilot/ask` | `{question, profile?, language}` | `{answer, citations:[{title,url,last_verified,quote_snippet}], grounded:boolean}` |
| POST | `/api/redflag/check` | `{claimed_amount, pages, validity_years, delivery}` | `{official_total, difference, difference_pct, flag:boolean, message_bn}` |
| POST | `/api/grs/draft` | `{incident_date, location, misconduct_type, official_ref?, description, language}` | `{subject, body, disclaimer, portal_url}` |
| GET | `/api/services` | none | Catalog of enabled services, supported tasks, and guide review dates |
| GET | `/api/services/{service_id}` | none | Validated guide content, task types, official links, and source dates |
| POST | `/api/services/{service_id}/checklist` | Minimal non-sensitive answers for a task | Conditional checklist, steps, warnings, source links, review date |

Rules:
- All responses are JSON; errors use `{error:{code,message}}`.
- `/api/copilot/ask` must return `grounded:false` and the fallback string when retrieval confidence is below threshold or citations cannot be verified.
- CORS enabled for the frontend origin only.
- Keep `/api/checklist` as the current e-Passport API until callers migrate; new services use the namespaced service API.
- Reject unknown/disabled service IDs and unsupported answer fields. Never accept document numbers or files in checklist requests.
- `/api/copilot/ask` accepts a service context; if none is selected, classify with a confidence threshold or ask a clarification. Filter retrieval by `service_id` before generation.

---

## 7. RAG PIPELINE SPEC

### 7.1 Ingestion (`rag/ingest.py`)
1. Curate source pages (manually saved or fetched, respecting robots/terms) from each relevant issuing authority. Never treat a third-party summary as the authority for a requirement.
2. Clean to Markdown, keep Bangla and English versions separate.
3. Chunk ~300 tokens with ~50 overlap, split on headings first.
4. Attach metadata (§3.4). `last_verified` = ingestion date.
5. Embed with multilingual model; upsert into a service-specific collection or the shared collection with mandatory `service_id` filtering. Do not combine service content without retaining that boundary.
6. Command: `python -m app.rag.ingest --rebuild`.

### 7.2 Retrieval (`rag/retriever.py`)
- Top-k = 5, optional metadata filter by `section` inferred from the question.
- Return similarity scores; drop chunks below `MIN_SCORE` (tune on test set).

### 7.3 Generation (`rag/generator.py`)
- Pass only retrieved chunks + wizard profile to the LLM.
- Required output JSON: `{"answer": "...", "used_chunk_ids": ["..."]}`.

### 7.4 Citation verifier (`rag/verifier.py`)
- Reject answer if `used_chunk_ids` is empty or references unknown ids.
- Cross-check numeric values in the answer (amounts, days, page counts) against the retrieved chunks and `fees.json`; if mismatch → regenerate once, else return fallback.
- Attach citations built from chunk metadata (never from LLM-written URLs).

### 7.5 Guardrail system prompt (store in `rag/prompts.py`)
```
You are ShebaShathi, an independent assistant that explains Bangladesh citizen identity and public-service procedures.
Rules:
1. Answer ONLY from the provided CONTEXT for the selected service. Do not use outside knowledge or rules from another service.
2. If the CONTEXT does not explicitly state the answer, return the selected service's configured fallback and official link. Do not guess which authority owns the process.
3. Never invent fees, dates, document names, phone numbers, or URLs.
4. Reply in simple, polite Bangla unless the user selects English.
5. Return JSON: {"answer": string, "used_chunk_ids": [string]}.
6. Never advise paying any unofficial fee or using an intermediary.
7. Never claim to authenticate a person or document, make a final legal/eligibility decision, submit an application, or access an official account.
8. Never ask the user to provide identity numbers, OTPs, account credentials, or document images to answer a guide question.
```

---

## 8. FALLBACK & SAFETY STRINGS

- Configure a Bangla and English not-in-sources fallback per service with that service's official URL. If the service or authority is ambiguous, ask the user to select the service before answering.
- **Global disclaimer (footer):** ShebaShathi BD is an independent citizen-help tool, not a government website. Always confirm at the official portal.
- **GRS disclaimer:** Draft only. Review facts before submitting. Do not include false claims.

---

## 9. DECISION ENGINE SPEC

### 9.1 `engine/fees.py`
- Input validated by Pydantic enums.
- Lookup in `fees.json`; if combination missing → HTTP 422 with message (do not compute).
- Output includes `base = total / (1 + vat_rate)` rounded, `vat = total - base`, plus `last_verified`, `source_url`.

### 9.2 `engine/checklist.py`
- Map profile → scenario (S1/S2/S3) → documents from `requirements.json`.
- Add conditional docs (e.g., lost passport → GD report).
- Output ordered steps: online application → fee payment → appointment/biometrics → delivery. (Exact steps from verified data only.)

### 9.3 `engine/redflag.py` (F6)
- `difference = claimed_amount - official_total`.
- `flag = difference > 0` ; message in Bangla: official amount, the extra amount, and advice to pay only via official channels and report via GRS.
- Never accuse a named person; flag the *amount* only.

### 9.4 GRS drafter (`drafter/grs.py`)
- Inputs: incident date, location/office, misconduct type (`delay | bribe_demand | document_refusal | other`), optional desk/official reference, free-text description.
- LLM prompt: formal Bangla, neutral tone, factual, no accusations beyond what the user states, includes date/place/facts/requested action, ends with applicant placeholder fields (name/phone left blank for the user).
- Output also includes link to the GRS portal (`https://grs.gov.bd`, verify) and a reminder to review before submission.
- Verify and document the correct complaint channel(s) and officer title in `data/grs_templates.json` with sources; do not state an officer designation unless verified.

---

## 10. FRONTEND SPEC

### Pages
| Route | Purpose |
|---|---|
| `/` | Citizen-services landing page: service directory, "Find my service" CTA, language toggle, disclaimer |
| `/services` | Directory of enabled services and supported tasks, with guide review dates |
| `/services/[serviceId]` | Service overview, task choices, official links, source dates, and privacy boundary |
| `/services/[serviceId]/guide` | Short conditional questionnaire and tailored preparation checklist |
| `/identity-check` | Optional browser-only comparison of selected identity fields; no file upload or network request |
| `/wizard` | Step-by-step cards (age/type → pages → validity → delivery) with progress bar |
| `/wizard/result` | Fee breakdown card (base, VAT, total, source + date), checklist, steps, "Download PDF" |
| `/copilot` | Chat UI; answers show citation chips (title, link, last verified); show "grounded" badge; fallback styling when not grounded |
| `/redflag` | Input quoted price → verdict card |
| `/grs` | Short form → drafted letter → Copy / Download PDF / Open GRS portal |

### UX requirements
- Mobile-first (assume low-end Android, slow network).
- Large tap targets, Bangla numerals optional toggle.
- Every fee/rule display shows "Source: <link>, verified <date>".
- Loading and error states for all API calls.
- Accessible contrast, keyboard navigable.
- PDF checklist must render Bangla glyphs correctly (test!).
- A visible service label must remain present throughout a guide and copilot session.
- State clearly when a workflow opens an official portal; do not imitate government sign-in, payment, or verification screens.
- Do not offer upload controls for NID, birth, passport, or licence documents.
- Browser-only field comparison must not write to localStorage, URL parameters, backend requests, logs, or analytics.

---

## 11. PHASED EXECUTION PLAN

> Each task has an ID. Mark `[x]` when done. A phase is complete only when ALL acceptance criteria pass.

### Phase 0 — Setup & Verification (Target: first)
- [ ] P0-1 Init monorepo, env files, docker-compose, lint/format.
- [ ] P0-2 Create `DECISIONS.md` and `data/VERIFICATION_LOG.md`.
- [ ] P0-3 Verify every `[UNVERIFIED]` fee/rule against official sources; populate `fees.json` and `requirements.json`.
- **Accept:** `fees.json` has `last_verified` set; log lists every source URL checked; no unverified value remains.

### Phase 1 — Deterministic Core (F1, F2, F3)
- [ ] P1-1 Implement `engine/fees.py` + `/api/fees/calculate`.
- [ ] P1-2 Implement `engine/checklist.py` + `/api/checklist`.
- [ ] P1-3 Build wizard UI + result page with fee card and checklist.
- [ ] P1-4 PDF export (Bangla font embedded).
- **Accept:** Unit tests pass for all fee combos; wizard completes for S1, S2, S3; PDF opens with correct Bangla text; works at 375px width.

### Phase 2 — RAG Copilot (F4)
- [ ] P2-1 Build corpus + ingestion script.
- [ ] P2-2 Retriever + generator + verifier.
- [ ] P2-3 `/api/copilot/ask` + chat UI with citations.
- [ ] P2-4 Evaluation set of 30 Q&A (see §13) and run script.
- **Accept:** ≥90% of in-scope eval questions grounded with correct citation; 100% of out-of-scope/trick questions return fallback; no answer contains a number absent from sources.

### Phase 3 — Civic Action (F5, F6)
- [ ] P3-1 GRS drafter endpoint + UI + copy/PDF.
- [ ] P3-2 Red-flag checker endpoint + UI.
- **Accept:** Drafts are formal Bangla, include all user-supplied facts, invent none; red-flag math matches fee engine.

### Phase 4 — Polish & Deploy
- [ ] P4-1 i18n completeness (bn/en), empty/error states.
- [ ] P4-2 Deploy frontend + backend; smoke test public URLs.
- [ ] P4-3 Seed demo data/scenarios; record backup demo video.
- [ ] P4-4 README with setup, architecture diagram, data-source list, limitations.
- **Accept:** Public URL works on mobile data; demo script (§12) runs end-to-end without manual fixes.

### Phase 5 — Shared Service Catalog + Birth Registration (R1)
- [x] P5-1 Add service catalog and validated per-service rule contract; migrate e-Passport rules without changing current behavior.
- [x] P5-2 Add service directory and reusable service overview/checklist UI in Bangla and English.
- [x] P5-3 Curate birth registration scenarios: new registration, correction, reprint, cancellation, verification/status; include only cases backed by official sources.
- [x] P5-4 Add service-scoped API and tests. Preserve official portal links for actions that must be completed externally.
- **Accept:** Each birth-registration task resolves to a documented official source and correct checklist; unknown or unverified cases get a safe fallback; e-Passport regressions are absent; no identity values are collected or persisted.

### Phase 6 — NID Guide (R2)
- [x] P6-1 Verify current NID registration, correction, replacement/reissue, and relevant voter-information workflows against Election Commission/NID sources.
- [x] P6-2 Encode conditional rules and bilingual content in NID service data; add source dates and explicit regional/age edge cases only when verified.
- [x] P6-3 Add NID guide UI and service-filtered copilot context.
- **Accept:** Every NID answer/checklist has a current official source; uncertain eligibility prompts clarification or links to the EC; no NID number, OTP, credential, or image enters our backend.

### Phase 7 — Cross-document Consistency Helper (R3)
- [x] P7-1 Implement user-selected text fields for name, date of birth, and parent names; compare only fields the user chooses.
- [x] P7-2 Keep all values in component memory only; clear them when leaving/reloading the page; do not persist or transmit.
- [x] P7-3 Explain that the tool detects text differences but cannot determine legal correctness or authenticate a record; link to the applicable correction guide.
- **Accept:** Browser network inspection confirms entered values never leave the device; accessible results identify differing fields without recommending which value to change; reset/clear works.

### Phase 8 — Driving Licence Guide (R4)
- [x] P8-1 Verify BRTA learner, new licence, renewal, duplicate, fee, and exam routes; separate professional/non-professional differences only where source-backed.
- [ ] P8-2 Add service rules, checklists, source dates, official links, and focused Q&A evaluation cases. (Rules, checklists, dates, and links done; a multi-service Q&A eval set is still pending.)
- **Accept:** Each supported task has a tested path; unsupported vehicle/category cases route to official BRTA guidance; no external application is automated.

### Phase 9 — Optional Death Registration (R5)
- [x] P9-1 Review capacity and user demand before adding the guide.
- [x] P9-2 Verify new registration, correction, reprint, cancellation, and verification/status guidance from official sources.
- **Accept:** Same evidence, privacy, bilingual, and regression criteria as prior guides. Do not start if existing guide refreshes are overdue.

### Ongoing — Source Refresh and Regression
- [ ] Review source-dated service rules on a planned cadence and after official notices or user reports.
- [x] Record each changed rule and its authority in `data/VERIFICATION_LOG.md`.
- [ ] Flag stale guides in the UI; do not silently promote stale snapshots to current requirements.
- **Accept:** A release cannot include a modified rule without a source URL, review date, change record, and regression test.

---

## 12. DEMO & PITCH SCRIPT (3 minutes)

1. **Hook (0:00–0:30):** Present a *sourced* statistic on unofficial payments/complaint awareness. Use only stats whose source link you verified (TIB reports, etc.). `[UNVERIFIED]` figures in the original draft (e.g., "53.3%", "98.6%", "৳3,000–৳10,000 saved") must be sourced or removed.
2. **Before/After (0:30–2:00):**
   - *Before:* an anonymized example of a middleman quote (create your own mock text; do not use real people's posts).
   - *After:* Wizard → "10-year, 48 pages, express" → show official total from `fees.json` (expected ৳8,050 if verified), checklist, payment channels; then Red-Flag check showing the overcharge.
3. **Anti-hallucination proof (2:00–2:30):** Ask "How much cash should I give the officer at the desk?" → app answers with official payment channels + citation; ask an unknowable question → app shows the fallback string.
4. **GRS drafter (2:30–3:00):** Generate a complaint letter, show copy/PDF, open the portal link.
5. For the expanded product demo, show service selection and a source-dated birth/NID checklist; demonstrate that the consistency helper flags differences locally and does not verify or upload a record.

---

## 13. TESTING & EVALUATION

### 13.1 Unit tests (backend)
- Every fee combination returns the expected total; invalid combination → 422.
- Checklist for S1/S2/S3 includes required docs and excludes irrelevant ones.
- Red-flag: claimed < official, = official, > official.
- Verifier rejects answers with unknown chunk ids or mismatched numbers.

### 13.2 RAG eval set (`backend/tests/eval_questions.json`)
30 items, each: `{question, expected: "answer"|"fallback", must_contain?: [...], expected_source_section}`.
Include: fees (5), documents (8), minors (4), renewal/lost (4), payment (3), photo (2), **trick questions** (4: bribes, cash, "which agent is fastest", "can I skip biometrics").

### 13.3 UX checks
- Lighthouse mobile ≥ 80 performance/accessibility.
- Test on a 375px viewport and a throttled network.
- Bangla rendering in UI and PDF.

### 13.4 Multi-service checks
- Rule contract rejects missing service IDs, unverified user-facing rules, malformed links, and unsupported task answers.
- Similar questions across services retrieve only the selected service's sources; ambiguous questions trigger clarification.
- For each service/task pair, test a standard case, each verified conditional branch, invalid answers, out-of-scope questions, and stale-source fallback.
- Test browser-only consistency comparison with network monitoring; values must not appear in requests, storage, console, or analytics.
- Regression-test the original e-Passport fees, checklists, copilot citations, GRS, and red-flag flows after each catalog/API change.

---

## 14. RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| Wrong/outdated fee shown | Single source of truth `fees.json`, visible `last_verified`, link to official page |
| LLM hallucination | Retrieval-only prompting, verifier, fallback string, numeric cross-check |
| Bangla PDF broken | Embed Noto Sans Bengali early; test in Phase 1 |
| Scraping blocked / site changes | Manually save pages into `corpus/`; commit snapshots |
| Legal exposure from GRS drafts | Neutral language, user-supplied facts only, disclaimer, no named accusations |
| Overreach on official-sounding branding | Footer disclaimer: independent tool, not a government site |
| Cross-service requirements get mixed | Mandatory `service_id` on rules, retrieval metadata, API responses, and UI context; service-filtered retrieval |
| Sensitive identity information leaks | No identity uploads or IDs; browser-only comparison; redaction and logging review; no telemetry containing user inputs |
| Official rules change | Source dates, visible review status, verification log, stale-content handling, scheduled review |
| User mistakes guide for official verification | Repeat the boundary in service pages and results; link to the issuing authority for verification/submission |
| Time overrun | Follow priority order; F6 and polish are cut-first |

---

## 15. DEFINITION OF DONE

- [ ] Current e-Passport MUST features (F1–F5) work end-to-end in a public deployment.
- [ ] Every enabled roadmap service passes its phase acceptance criteria before being advertised as supported.
- [ ] Every displayed fact traces to a verified source with a date.
- [ ] Eval criteria in §11 Phase 2 met.
- [ ] No PII stored; no secrets committed.
- [ ] No document number, image, OTP, or credential is sent to or retained by the app.
- [ ] `ml_core/` remains untouched unless the user explicitly authorizes work there.
- [ ] README, `.env.example`, and `docker-compose up` run cleanly.
- [ ] 3-minute demo rehearsed with a backup recording.

---

## 16. CHANGELOG NOTES FOR THE AGENT

When you finish a task, append a one-line entry to `DECISIONS.md`: `YYYY-MM-DD | task id | what changed | why`. If you discover that any value in this planner is wrong, fix the data file, log it in `VERIFICATION_LOG.md`, and note the discrepancy here.
