"""
ShebaShathi BD - Backend API
FastAPI application for e-Passport services.
"""
import asyncio
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
)
from .engine import fees as fees_engine
from .engine import checklist as checklist_engine
from .engine import redflag as redflag_engine
from .engine import fee_schedules as fee_schedule_engine
from .drafter import grs as grs_drafter
from .services import engine as service_engine
from .services import loader as service_loader

app = FastAPI(
    title="ShebaShathi BD API",
    description="Bangladesh citizen-services helper - service guides and checklists, official fee calculator, RAG copilot, and GRS complaint drafter.",
    version="0.1.0",
)


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

# =========================================================================

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

@app.get("/api/services/{service_id}", tags=["Services"])
async def service_overview(service_id: str):
    """Validated guide content, task types, official links, and source dates."""
    try:
        return service_loader.service_detail(service_id)
    except KeyError:
        raise HTTPException(status_code=404, detail={"error": {"code": "SERVICE_NOT_FOUND", "message": "The requested service is not available."}})

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

@app.post("/api/copilot/ask", response_model=CopilotAskResponse, tags=["RAG Copilot"])
async def copilot_ask(req: CopilotAskRequest):
    """
    Question-answering with RAG retrieval and citation.

    A ``service_id`` scopes retrieval to one authority and selects that
    service's configured fallback string. Without it, the legacy e-Passport
    context is used unchanged.
    """
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
    provider = llm.describe_provider()
    return {
        "status": "ok",
        "data_last_verified": data_last_verified,
        "llm_provider": provider["provider"],
        "llm_model": provider["model"],
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
