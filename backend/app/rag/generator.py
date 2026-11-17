"""Generation over Chroma results; extractive mode works without an LLM key."""
import json

from .. import llm
from .extractive import supported_excerpt
from .prompts import SYSTEM_PROMPT, plain_text
from .retriever import retrieve


def _extractive_answer(question: str, docs: list[dict], language: str) -> dict:
    if not docs:
        return {"answer": "", "used_chunk_ids": [], "answerable": False}
    supported = supported_excerpt(question, docs)
    if supported is None:
        # The retrieved chunk shares only a service word or is too weak to
        # answer. Returning the fallback is safer than presenting a near miss.
        return {"answer": "", "used_chunk_ids": [], "answerable": False}
    # Return retrieved source text as-is; never synthesize unsupported claims offline.
    return {"answer": supported["text"], "used_chunk_ids": [supported["id"]], "answerable": True}


def generate(question: str, profile=None, language: str = "bn", docs: list[dict] | None = None,
             service_id: str | None = None) -> dict:
    results = (
        retrieve(question, service_id=service_id, language=language)
        if docs is None else docs
    )
    if not results:
        return {"answer": "", "used_chunk_ids": [], "answerable": False,
                "retrieved_chunks": [], "generation_mode": "unavailable"}

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
            answer = parsed.get("answer")
            used = parsed.get("used_chunk_ids")
            answerable = parsed.get("answerable", True)
            if (not isinstance(answer, str) or not isinstance(used, list)
                    or not isinstance(answerable, bool)):
                raise ValueError("invalid answer shape")
            parsed["answer"] = plain_text(answer)
            parsed["answerable"] = bool(answerable and parsed["answer"] and used)
            generated = parsed
            mode = "api"
            provider = llm.provider_name()
            model = response.get("model") or llm.model_id()
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
