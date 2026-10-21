"""Generation over Chroma results; extractive mode works without an LLM key."""
import json

from .. import llm
from .prompts import SYSTEM_PROMPT
from .retriever import retrieve


def _extractive_answer(question: str, docs: list[dict], language: str) -> dict:
    if not docs:
        return {"answer": "", "used_chunk_ids": []}
    # Return retrieved source text as-is; never synthesize unsupported claims offline.
    return {"answer": docs[0]["text"], "used_chunk_ids": [docs[0]["id"]]}


def generate(question: str, profile=None, language: str = "bn", docs: list[dict] | None = None,
             service_id: str | None = None) -> dict:
    results = retrieve(question, service_id=service_id) if docs is None else docs
    if not results:
        return {"answer": "", "used_chunk_ids": [], "retrieved_chunks": [], "generation_mode": "unavailable"}

    mode = "extractive"
    generated = None
    provider = "none"
    model = None
    if llm.is_configured():
        context = "\n\n".join(
            f"[chunk_id={doc['id']} section={doc['metadata'].get('section', '')}]\n{doc['text']}"
            for doc in results
        )
        profile_context = json.dumps(profile or {}, ensure_ascii=False)
        prompt = f"Question ({language}): {question}\nApplicant profile: {profile_context}\n\nRetrieved context:\n{context}"
        try:
            response = llm.completion([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ])
            parsed = response.get("parsed")
            if parsed is None:
                parsed = json.loads(response["content"])
            if isinstance(parsed.get("answer"), str) and isinstance(parsed.get("used_chunk_ids"), list):
                generated = parsed
                mode = "api"
                provider = llm.provider_name()
                model = llm.model_id()
        except Exception:
            # The source-grounded extractive path remains available if the optional API fails.
            generated = None

    if generated is None:
        generated = _extractive_answer(question, results, language)
    return {
        **generated,
        "retrieved_chunks": results,
        "generation_mode": mode,
        "llm_provider": provider,
        "llm_model": model,
    }
