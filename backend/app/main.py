"""
ShebaShathi BD - Backend API
FastAPI application for e-Passport services.
"""
import asyncio
import os
import sys

if sys.platform == "win32":
    # On Windows the default Proactor event loop can abort the whole server with
    # "WinError 64: The specified network name is no longer available" when a
    # client resets a connection. The selector loop is the documented
    # workaround. uvicorn creates the loop after the app is imported, so this
    # takes effect for `uvicorn app.main:app` as well.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path

from .config import settings
from .schemas import (
    FeeCalculateRequest, FeeCalculateResponse,
    ChecklistRequest, ChecklistResponse,
    CopilotAskRequest, CopilotAskResponse,
    RedFlagCheckRequest, RedFlagCheckResponse,
    GRSDraftRequest, GRSDraftResponse,
    ServiceChecklistRequest, ServiceChecklistResponse,
    IntakeRequest, IntakeResponse,
    CopilotChatRequest, CopilotChatResponse, CaseBriefResponse,
)
from .engine import fees as fees_engine
from .engine import checklist as checklist_engine
from .engine import redflag as redflag_engine
from .engine import fee_schedules as fee_schedule_engine
from .drafter import grs as grs_drafter
from .services import engine as service_engine
from .services import loader as service_loader
from .services import refresh as service_refresh
from .intake import engine as intake_engine
from .privacy import contains_identity_number, contains_sensitive_data, screened_note
from .rag import guard as rag_guard
from .rag import fee_answer as rag_fee_answer
from .rag import photo_answer as rag_photo_answer
from .rag import status_answer as rag_status_answer
from .guidance import get_guide as get_status_guide
from .rag import chat as rag_chat
from .rag import brief as rag_brief
from .rate_limit import SlidingWindowLimiter, enforce as enforce_rate_limit

app = FastAPI(
    title="ShebaShathi BD API",
    description="Bangladesh citizen-services helper - service guides and checklists, official fee calculator, RAG copilot, and GRS complaint drafter.",
    version="0.1.0",
)


@app.on_event("startup")
async def warm_retrieval_index() -> None:
    """Warm Chroma and the embedding model before accepting real questions.

    The first embedding call can take tens of seconds on a cold machine (model
    load and cache checks). The warmup deliberately runs on the startup event
    loop instead of a background thread: the embedder and Chroma client are
    cached, and reusing an instance created on another thread made retrieval
    fail intermittently. Set ``WARM_RETRIEVAL=false`` to skip this and pay the
    cold-start cost on the first question instead.
    """
    if (os.environ.get("WARM_RETRIEVAL", "true") or "").lower() in ("0", "false", "no"):
        return

    try:
        from .rag.retriever import collection_count, retrieve

        collection_count()
        retrieve("passport application documents")
    except Exception:  # noqa: BLE001 - warming must never block startup
        pass



@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={
        "error": {"code": "VALIDATION_ERROR", "message": "The request contains invalid or unsupported values."}
    })


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        content = exc.detail
    else:
        content = {"error": {"code": "HTTP_ERROR", "message": str(exc.detail)}}
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)

# CORS - allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Costly endpoints get a per-client sliding window. The limiter is
# process-local; see docs/DEPLOYMENT.md for the multi-instance caveat.
copilot_limiter = SlidingWindowLimiter(
    settings.rate_limit_per_minute, enabled=settings.rate_limit_enabled
)
intake_limiter = SlidingWindowLimiter(
    settings.intake_rate_limit_per_minute, enabled=settings.rate_limit_enabled
)

# =========================================================================

@app.post("/api/intake", response_model=IntakeResponse, tags=["AI Intake"])
async def intake(req: IntakeRequest, request: Request):
    """Map a free-text situation to one service/task and ask for missing answers.

    The response is a routing result, not an official decision. Every document,
    step, fee and eligibility rule still comes from the validated service data.
    Identity-like numbers are rejected before any model call.
    """
    enforce_rate_limit(intake_limiter, request)
    if contains_identity_number(req.text):
        raise HTTPException(
            status_code=422,
            detail={
                "error": {
                    "code": "IDENTITY_DATA_REJECTED",
                    "message": "Remove ID, passport, phone or OTP numbers. Describe only the service and your situation.",
                }
            },
        )
    return intake_engine.route(
        req.text,
        req.language,
        service_id=req.service_id,
        task_id=req.task_id,
    )

@app.post("/api/checklist", response_model=ChecklistResponse, tags=["Checklist"])
async def get_checklist(req: ChecklistRequest):
    """
    Generate document checklist and process steps from wizard profile.
    """
    try:
        result = checklist_engine.generate(req.profile)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": str(e)}})
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The checklist could not be generated."}})

@app.get("/api/services", tags=["Services"])
async def list_catalog():
    """Catalog of enabled services, supported tasks, and guide review dates."""
    return {
        **service_loader.catalog_meta(),
        "services": service_loader.list_services(),
    }

@app.get("/api/services/refresh-status", tags=["Services"])
async def service_refresh_status():
    """Last daily official-source check for each enabled service.

    This reports whether the public official pages were reachable and whether
    their content changed. A change is flagged for human review; verified guide
    content is never rewritten automatically.
    """
    return service_refresh.read_status()

@app.get("/api/services/{service_id}", tags=["Services"])
async def service_overview(service_id: str):
    """Validated guide content, task types, official links, and source dates."""
    try:
        return service_loader.service_detail(service_id)
    except KeyError:
        raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})

@app.get("/api/services/{service_id}/status-guide", tags=["Services"])
async def service_status_guide(service_id: str):
    """Deterministic status explanations, diaspora guidance and fraud warnings.

    Public, non-sensitive content only: this endpoint collects no identifiers
    and replaces no official status check.
    """
    try:
        return get_status_guide(service_id)
    except KeyError:
        raise HTTPException(status_code=404, detail={"error": {"code": "GUIDANCE_NOT_FOUND", "message": "No verified status guide is available for this service."}})

@app.post("/api/services/{service_id}/checklist", response_model=ServiceChecklistResponse, tags=["Services"])
async def service_checklist(service_id: str, req: ServiceChecklistRequest):
    """Conditional checklist for one service task from minimal, non-sensitive answers."""
    try:
        return service_engine.generate(service_id, req.task, req.answers, req.language)
    except KeyError:
        raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})
    except service_engine.ChecklistInputError as e:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": str(e)}})
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The checklist could not be generated."}})

@app.post("/api/services/{service_id}/checklist/brief", response_model=CaseBriefResponse, tags=["AI Intake"])
async def service_checklist_brief(service_id: str, req: ServiceChecklistRequest, request: Request):
    """Explain a verified checklist in plain language.

    The deterministic checklist is built first and is the model's only allowed
    source. If generation fails or adds an unsupported fact, the deterministic
    summary is returned. The request carries only minimal, non-sensitive
    answers: no identity numbers, files or credentials are accepted.
    """
    enforce_rate_limit(copilot_limiter, request)
    try:
        checklist = service_engine.generate(service_id, req.task, req.answers, req.language)
        service = service_loader.get_service(service_id)
    except KeyError:
        raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})
    except service_engine.ChecklistInputError as e:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": str(e)}})
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The checklist could not be generated."}})
    try:
        result = rag_brief.generate(checklist, service, req.language)
        return {**result, "source_url": checklist["source_url"], "last_verified": checklist["last_verified"]}
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The explanation could not be generated."}})

@app.post("/api/copilot/chat", response_model=CopilotChatResponse, tags=["RAG Copilot"])
async def copilot_chat(req: CopilotChatRequest, request: Request):
    """Multi-turn, source-grounded chat with deterministic tools first.

    The browser sends the recent conversation; nothing is stored server-side.
    Messages that screen as sensitive (identity-like numbers, codes) are
    answered locally and never forwarded to the model provider.
    """
    enforce_rate_limit(copilot_limiter, request)
    if req.service_id is not None:
        try:
            service_loader.get_service(req.service_id)
        except KeyError:
            raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})
    try:
        return rag_chat.respond(
            req.question,
            [turn.model_dump() for turn in req.history],
            req.language,
            req.service_id,
        )
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The assistant could not answer right now."}})

@app.post("/api/copilot/ask", response_model=CopilotAskResponse, tags=["RAG Copilot"])
async def copilot_ask(req: CopilotAskRequest, request: Request):
    """
    Question-answering with RAG retrieval and citation.

    A ``service_id`` scopes retrieval to one authority and selects that
    service's configured fallback string. Without it, the legacy e-Passport
    context is used unchanged.

    Safety order: rate limit, deterministic unsafe-intent guard, deterministic
    tools, then retrieval/generation. A screened question is answered locally
    and never reaches the LLM.
    """
    enforce_rate_limit(copilot_limiter, request)
    unsafe_category = rag_guard.classify(req.question)
    if unsafe_category:
        return CopilotAskResponse(
            answer=rag_guard.safety_message(unsafe_category, req.language),
            citations=[],
            grounded=False,
            retrieved_chunks=[],
            generation_mode="safety",
            llm_provider="none",
            llm_model=None,
            safety_blocked=True,
        )
    # Verified fee amounts are deterministic. The LLM never chooses between
    # regular, express and super-express tiers.
    try:
        deterministic_fee = rag_fee_answer.answer(req.question, req.service_id, req.language)
    except Exception:
        deterministic_fee = None
    if deterministic_fee is not None:
        return CopilotAskResponse(**deterministic_fee)
    try:
        deterministic_photo = rag_photo_answer.answer(req.question, req.service_id, req.language)
    except Exception:
        deterministic_photo = None
    if deterministic_photo is not None:
        return CopilotAskResponse(**deterministic_photo)
    try:
        deterministic_status = rag_status_answer.answer(req.question, req.service_id, req.language)
    except Exception:
        deterministic_status = None
    if deterministic_status is not None:
        return CopilotAskResponse(**deterministic_status)

    # Privacy screen: a sensitive-sounding question is answered locally from
    # the retrieved context; it is never forwarded to the model provider.
    if req.service_id is not None:
        try:
            service_loader.get_service(req.service_id)
        except KeyError:
            raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})
    if contains_sensitive_data(req.question):
        from .rag.retriever import retrieve as _retrieve

        try:
            docs = _retrieve(req.question, top_k=settings.top_k, service_id=req.service_id)
        except Exception:  # noqa: BLE001 - index unavailable, use the safe fallback
            docs = []
        note = screened_note(req.language)
        if docs:
            first = docs[0]
            return CopilotAskResponse(
                answer=first["text"] + note,
                citations=[{
                    "title": first["metadata"].get("title", "Official source"),
                    "url": first["metadata"]["source_url"],
                    "last_verified": first["metadata"]["last_verified"],
                    "quote_snippet": first["text"][:300],
                }],
                grounded=True,
                retrieved_chunks=[
                    {"id": d["id"], "score": d["score"], "section": d["metadata"].get("section", "")}
                    for d in docs
                ],
                generation_mode="screened_local",
                llm_provider="none",
                llm_model=None,
                safety_blocked=True,
            )
        from .rag.prompts import FALLBACK_BN as _FB_BN, FALLBACK_EN as _FB_EN

        return CopilotAskResponse(
            answer=(_FB_EN if req.language == "en" else _FB_BN) + note,
            citations=[],
            grounded=False,
            retrieved_chunks=[],
            generation_mode="screened_local",
            llm_provider="none",
            llm_model=None,
            safety_blocked=True,
        )

    try:
        from .rag import generator as rag_gen
        from .rag import verifier as rag_ver
        from .rag.prompts import FALLBACK_BN, FALLBACK_EN
        from .rag.retriever import retrieve

        if req.service_id is not None:
            try:
                service_loader.get_service(req.service_id)
            except KeyError:
                raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})

        profile = req.profile.model_dump() if req.profile else None
        docs = retrieve(req.question, top_k=settings.top_k, service_id=req.service_id)
        answer_result = rag_gen.generate(req.question, profile, req.language, docs=docs, service_id=req.service_id)

        if req.service_id is not None:
            service = service_loader.get_service(req.service_id)
            fallback = service["fallback_en"] if req.language == "en" else service["fallback_bn"]
        else:
            fallback = FALLBACK_EN if req.language == "en" else FALLBACK_BN

        verified = rag_ver.verify(answer_result, req.question)
        if not verified.get("grounded", False):
            return {
                "answer": fallback,
                "citations": [],
                "grounded": False,
                "retrieved_chunks": [
                    {"id": d["id"], "score": d["score"], "section": d["metadata"].get("section", "")}
                    for d in docs
                ],
                "generation_mode": answer_result.get("generation_mode", "unavailable"),
                "llm_provider": answer_result.get("llm_provider", "none"),
                "llm_model": answer_result.get("llm_model"),
            }

        citations = []
        retrieved_by_id = {d["id"]: d for d in docs}
        for chunk_id in verified.get("used_chunk_ids", []):
            chunk = retrieved_by_id[chunk_id]
            metadata = chunk["metadata"]
            citations.append({
                "title": metadata.get("title", "Official source"),
                "url": metadata["source_url"],
                "last_verified": metadata["last_verified"],
                "quote_snippet": chunk["text"][:300],
            })

        return {
            "answer": verified["answer"],
            "citations": citations,
            "grounded": True,
            "retrieved_chunks": [
                {"id": d["id"], "score": d["score"], "section": d["metadata"].get("section", "")}
                for d in docs
            ],
            "generation_mode": answer_result.get("generation_mode", "extractive"),
            "llm_provider": answer_result.get("llm_provider", "none"),
            "llm_model": answer_result.get("llm_model"),
        }
    except HTTPException:
        raise
    except Exception:
        fallback = "The retrieval index is unavailable. Please check the official portal." if req.language == "en" else "তথ্যভান্ডারটি এখন পাওয়া যাচ্ছে না। অনুগ্রহ করে সরকারি পোর্টালে যাচাই করুন।"
        if req.service_id is not None and service_loader.is_enabled(req.service_id):
            service = service_loader.get_service(req.service_id)
            fallback = service["fallback_en"] if req.language == "en" else service["fallback_bn"]
        return {
            "answer": fallback,
            "citations": [],
            "grounded": False,
            "retrieved_chunks": [],
            "generation_mode": "unavailable",
            "llm_provider": "none",
            "llm_model": None,
        }

@app.post("/api/redflag/check", response_model=RedFlagCheckResponse, tags=["Red Flag"])
async def check_red_flag(req: RedFlagCheckRequest):
    """
    Compare claimed amount against official fees.
    """
    try:
        result = redflag_engine.check(req.claimed_amount, req.pages, req.validity_years, req.delivery)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": str(e)}})
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The fee could not be calculated."}})

@app.post("/api/grs/draft", tags=["GRS Drafter"])
async def draft_grs(req: GRSDraftRequest):
    """
    Generate a formal complaint letter for GRS (General Registration)
    """
    try:
        result = grs_drafter.generate(req)
        return result
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The fee could not be checked."}})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(settings.port))

# Routes
# =========================================================================

@app.get("/", tags=["Health"])
async def root():
    return {"message": "ShebaShathi BD API - citizen-services helper"}

@app.get("/health", tags=["Health"])
async def health():
    fees_path = Path(__file__).resolve().parents[2] / "data" / "fees.json"
    with fees_path.open("r", encoding="utf-8") as source:
        data_last_verified = json.load(source).get("last_verified")
    from . import llm
    from .rag.retriever import collection_count
    provider = llm.describe_provider()
    index_count = collection_count()
    return {
        "status": "ok",
        "data_last_verified": data_last_verified,
        "llm_provider": provider["provider"],
        "llm_model": provider["model"],
        "service_count": len(service_loader.list_services()),
        "index_count": index_count,
        "ai_ready": index_count > 0,
    }

@app.get("/api/fee-schedules", tags=["Fees"])
async def fee_schedules():
    """Public, non-sensitive catalog of verified official fee schedules.

    The browser performs the calculation locally; only these public labels,
    parameters, amounts, source URLs and verification dates are fetched.
    """
    try:
        return fee_schedule_engine.catalog()
    except RuntimeError:
        raise HTTPException(status_code=500, detail={"error": {"code": "FEE_DATA_UNAVAILABLE", "message": "The verified fee schedule is not available right now."}})


@app.post("/api/fees/calculate", response_model=FeeCalculateResponse, tags=["Fees"])
async def calculate_fees(req: FeeCalculateRequest):
    """
    Deterministic fee calculator.
    Input: { pages, validity_years, delivery }
    Output: { base, vat, total, source_url, last_verified, ... }
    """
    try:
        result = fees_engine.calculate(req.pages, req.validity_years, req.delivery)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": {"code": "VALIDATION_ERROR", "message": str(e)}})
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "The complaint draft could not be generated."}})
