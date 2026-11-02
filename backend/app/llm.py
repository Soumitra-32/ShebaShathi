"""Optional chat-completion adapter for OpenAI-compatible providers.

OpenRouter (https://openrouter.ai/api/v1), OpenAI and any other
OpenAI-compatible endpoint are supported through the same three environment
variables:

    LLM_API_BASE   e.g. https://openrouter.ai/api/v1
    LLM_API_KEY    the provider key (never logged, never echoed in an error)
    LLM_MODEL      the provider model id, e.g. anthropic/claude-3.5-sonnet

No key means no LLM call at all: the copilot keeps its cited extractive
answer and intake uses its deterministic router. This adapter is used by the
source-grounded copilot and the optional intake classifier; the complaint
drafter, the document comparison and the voice input never reach any external
service.
"""
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
REQUEST_TIMEOUT_SECONDS = 45
MAX_ERROR_LENGTH = 240

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


class LLMProviderError(RuntimeError):
    """A provider call failed. The message is safe to show to a user."""


def api_base() -> str:
    return (os.environ.get("LLM_API_BASE", "") or DEFAULT_BASE_URL).strip().rstrip("/")


def api_key() -> str:
    return (os.environ.get("LLM_API_KEY", "") or "").strip()


def model_id() -> str:
    return (os.environ.get("LLM_MODEL", "") or DEFAULT_MODEL).strip()


def fallback_models() -> list[str]:
    """Optional comma-separated model ids tried when the primary is unusable.

    This keeps the assistant working if a stronger primary model is
    temporarily rate-limited or the account cannot access it. Fallbacks are
    opt-in through ``LLM_MODEL_FALLBACKS`` so existing deployments keep their
    single-model behaviour and tests stay deterministic.
    """
    raw = (os.environ.get("LLM_MODEL_FALLBACKS", "") or "").strip()
    if not raw:
        return []
    seen = {model_id()}
    models: list[str] = []
    for item in raw.split(","):
        model = item.strip()
        if model and model not in seen:
            seen.add(model)
            models.append(model)
    return models



def app_title() -> str:
    return (os.environ.get("LLM_APP_TITLE", "") or "").strip()


def http_referer() -> str:
    return (os.environ.get("LLM_HTTP_REFERER", "") or "").strip()


def is_configured() -> bool:
    return bool(api_key())


def provider_name() -> str:
    """Human-readable provider id: openrouter, openai, openai-compatible or none."""
    if not is_configured():
        return "none"
    base = api_base().lower()
    if "openrouter.ai" in base:
        return "openrouter"
    if "api.openai.com" in base:
        return "openai"
    return "openai-compatible"


def describe_provider() -> dict:
    """Provider description for the API and the UI. Never contains the key."""
    return {
        "provider": provider_name(),
        "model": model_id() if is_configured() else None,
        "configured": is_configured(),
    }


def _endpoint() -> str:
    base = api_base()
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def _headers() -> dict:
    headers = {
        "Authorization": f"Bearer {api_key()}",
        "Content-Type": "application/json",
    }
    # OpenRouter uses these for dashboard attribution; they are optional.
    if "openrouter.ai" in api_base().lower():
        if http_referer():
            headers["HTTP-Referer"] = http_referer()
        if app_title():
            headers["X-Title"] = app_title()
    return headers


def _provider_message(raw: bytes) -> str:
    """Extract a short, safe message from a provider error body."""
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except (ValueError, UnicodeDecodeError):
        return ""
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("code") or ""
        elif isinstance(error, str):
            message = error
        else:
            message = data.get("message") or ""
        if isinstance(message, str) and message:
            return message[:MAX_ERROR_LENGTH]
    return ""


def _status_message(status: int, detail: str) -> str:
    if status == 401:
        return "The configured language-model provider rejected the API key."
    if status == 402:
        return "The configured language-model provider has no credit left."
    if status == 429:
        return "The configured language-model provider is rate-limiting requests right now."
    if status == 404:
        return "The configured model was not found at the language-model provider."
    if status >= 500:
        return "The configured language-model provider is not available right now."
    if detail:
        return f"The language-model provider rejected the request: {detail}"
    return "The language-model provider rejected the request."


def _post(payload: dict) -> dict:
    request = Request(_endpoint(), data=json.dumps(payload).encode("utf-8"), headers=_headers(), method="POST")
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw = response.read()
    except HTTPError as error:
        detail = ""
        try:
            detail = _provider_message(error.read() or b"")
        except Exception:  # noqa: BLE001 - never let an error body hide the failure
            detail = ""
        raise LLMProviderError(_status_message(error.code, detail)) from None
    except URLError:
        raise LLMProviderError("The language-model provider could not be reached.") from None
    except TimeoutError:
        raise LLMProviderError("The language-model provider took too long to answer.") from None

    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        raise LLMProviderError("The language-model provider returned an unreadable response.") from None

    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        raise LLMProviderError("The language-model provider returned no answer.")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str):
        raise LLMProviderError("The language-model provider returned an empty answer.")
    return {"content": content, "usage": data.get("usage", {})}


def _parse_json(content: str) -> dict:
    """Parse the model's JSON answer, tolerating a fenced code block."""
    text = _FENCE_RE.sub("", content.strip()).strip()
    try:
        parsed = json.loads(text)
    except ValueError:
        raise LLMProviderError("The language-model provider did not return valid JSON.") from None
    if not isinstance(parsed, dict):
        raise LLMProviderError("The language-model provider did not return a JSON object.")
    return parsed


def completion(messages, temperature: float = 0.0, max_tokens: int = 800,
               model: str | None = None) -> dict:
    """Send a chat completion and return ``{"content": str, "usage": dict}``.

    Raises ``LLMProviderError`` with a user-safe message when the provider
    fails. Never raises an error that contains the API key. When
    ``LLM_MODEL_FALLBACKS`` is configured, availability/model errors are
    retried with the next model; the response reports the model that answered.
    """
    if not is_configured():
        raise LLMProviderError("No language-model provider is configured.")

    candidates = [model or model_id(), *fallback_models()]
    last_error: LLMProviderError | None = None
    for index, candidate in enumerate(candidates):
        try:
            return _completion_once(messages, temperature, max_tokens, candidate)
        except LLMProviderError as error:
            last_error = error
            if index == len(candidates) - 1 or not _can_fallback(error):
                raise
    raise last_error or LLMProviderError("The language-model provider returned no answer.")


def _can_fallback(error: LLMProviderError) -> bool:
    text = str(error).lower()
    return any(
        hint in text
        for hint in (
            "not found",
            "rate-limiting",
            "no credit",
            "not available right now",
            "took too long",
            "could not be reached",
            "unreadable response",
            "no answer",
            "empty answer",
            "valid json",
            "rejected the request",
        )
    )


def _completion_once(messages, temperature: float, max_tokens: int, model: str) -> dict:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    try:
        response = _post(payload)
    except LLMProviderError as error:
        # Not every OpenRouter model supports JSON mode. Retry once without it.
        detail = str(error).lower()
        if not any(hint in detail for hint in ("response_format", "json_object", "json mode")):
            raise
        payload.pop("response_format", None)
        response = _post(payload)

    parsed = _parse_json(response["content"])
    # Return normalised JSON so the caller can parse it without extra handling.
    response["content"] = json.dumps(parsed, ensure_ascii=False)
    response["parsed"] = parsed
    response["model"] = model
    return response
