"""Run the 30-question eval against the live copilot provider.

Usage (from ``backend/``):

    python scripts/live_eval.py            # all 30 questions
    python scripts/live_eval.py --id fees-02

The script loads ``.env`` from the repository root if the provider variables
are not already set. It never prints the key. Results are measured, not
invented: ``grounded`` comes from the API verifier and the token check is a
secondary, explicitly labelled check.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# English and Bangla forms are both accepted. This prevents a correct Bangla
# answer from being scored as missing an English-only token.
_ALIASES: dict[str, tuple[str, ...]] = {
    "4025": ("4025",), "8050": ("8050",), "13800": ("13800",), "15": ("15",),
    "5": ("5",), "45": ("45",), "3r": ("3r",),
    "a-challan": ("a-challan", "এ-চালান", "চালান"),
    "brc": ("brc", "birth registration certificate", "জন্ম নিবন্ধন সনদ"),
    "nid": ("nid", "national id", "এনআইডি", "জাতীয় পরিচয়পত্র"),
    "epi": ("epi", "ইপিআই"),
    "licence": ("licence", "license", "লাইসেন্স"),
    "death": ("death", "মৃত্যু"),
    "parent": ("parent", "father", "mother", "পিতা", "মাতা", "অভিভাবক"),
    "passport": ("passport", "পাসপোর্ট"),
    "gd": ("gd", "general diary", "জিডি"),
    "reissue": ("reissue", "re-issue", "re issue", "রি-ইস্যু", "রিইস্যু", "পুনঃইস্যু", "পুনঃমুদ্রণ"),
    "renew": ("renew", "renewal", "নবায়ন", "রি-ইস্যু"),
    "shurjopay": ("shurjopay", "সুরজপে"),
    "fee": ("fee", "ফি"),
    "biometric": ("biometric", "বায়োমেট্রিক"),
}


def normalise(text: str) -> str:
    return text.translate(_BN_DIGITS).casefold()


def token_present(token: str, answer: str) -> bool:
    value = normalise(answer)
    aliases = _ALIASES.get(token.casefold(), (token.casefold(),))
    for alias in aliases:
        if token.isdigit():
            if re.search(rf"(?<!\d){re.escape(alias)}(?!\d)", value):
                return True
        elif alias in value:
            return True
    return False


def ascii_safe(text: str, limit: int = 240) -> str:
    cleaned = text.replace("\n", " ").strip()
    return cleaned.encode("ascii", "replace").decode()[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", help="run one eval id (for example fees-02)")
    args = parser.parse_args()

    questions = json.loads(
        (ROOT / "backend" / "app" / "tests" / "eval_questions.json").read_text(encoding="utf-8")
    )["questions"]
    if args.id:
        questions = [item for item in questions if item["id"] == args.id]
        if not questions:
            print(f"Unknown id: {args.id}")
            return 2

    client = TestClient(app)
    answer_total = answer_grounded = answer_tokens = 0
    fallback_total = fallback_correct = 0
    failures: list[dict] = []
    rows: list[dict] = []

    for item in questions:
        response = client.post("/api/copilot/ask", json={
            "question": item["question"],
            "service_id": item["service_id"],
            "language": item["language"],
        })
        if response.status_code != 200:
            body = response.json()
            row = {
                "id": item["id"], "expected": item["expected"], "status": response.status_code,
                "grounded": False, "safety_blocked": False, "token_hit": False,
                "answer": json.dumps(body, ensure_ascii=False)[:240],
            }
        else:
            body = response.json()
            answer = body.get("answer", "")
            tokens = all(token_present(token, answer) for token in item["must_contain"])
            row = {
                "id": item["id"], "expected": item["expected"], "status": 200,
                "grounded": bool(body.get("grounded")),
                "safety_blocked": bool(body.get("safety_blocked")),
                "token_hit": tokens,
                "generation_mode": body.get("generation_mode"),
                "answer": ascii_safe(answer),
            }
        rows.append(row)

        if item["expected"] == "answer":
            answer_total += 1
            if row["grounded"]:
                answer_grounded += 1
            if row["grounded"] and row["token_hit"]:
                answer_tokens += 1
            if not (row["grounded"] and row["token_hit"]):
                failures.append(row)
        else:
            fallback_total += 1
            if (not row["grounded"]) or row["safety_blocked"]:
                fallback_correct += 1
            else:
                failures.append(row)

    for row in rows:
        flags = (
            f"mode={row.get('generation_mode')} grounded={row['grounded']} "
            f"token={row['token_hit']} safety={row['safety_blocked']}"
        )
        print(f"{row['id']:<12} {row['expected']:<8} {flags}")
        if row.get("answer") and row["id"] in {item['id'] for item in failures}:
            print(f"  {row['answer']}")

    print("\nSUMMARY")
    print(f"answer questions grounded: {answer_grounded}/{answer_total}")
    print(f"answer questions grounded+token: {answer_tokens}/{answer_total}")
    print(f"fallback questions correct: {fallback_correct}/{fallback_total}")
    print(f"provider: {os.environ.get('LLM_API_BASE', 'default')} / {os.environ.get('LLM_MODEL', 'default')}")
    print("note: token coverage accepts English and Bangla equivalents; it is secondary evidence.")
    if failures:
        print("failed ids:", ", ".join(row["id"] for row in failures))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
