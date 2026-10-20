"""Optional OpenAI-compatible chat completion adapter. No key means no LLM call."""
import json
import os
from urllib.request import Request, urlopen


def is_configured() -> bool:
    return bool(os.environ.get("LLM_API_KEY", "").strip())


def completion(messages, temperature=0.0, max_tokens=800):
    api_key = os.environ.get("LLM_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("LLM_API_KEY is not configured")
    base = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1").rstrip("/")
    endpoint = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
    payload = {
        "model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    request = Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers={
        "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
    }, method="POST")
    with urlopen(request, timeout=25) as response:
        data = json.loads(response.read().decode("utf-8"))
    return {"content": data["choices"][0]["message"]["content"], "usage": data.get("usage", {})}
