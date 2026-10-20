"""Deterministic fee lookup from the portal-verified fee schedule."""
import json
from pathlib import Path

FEES_FILE = Path(__file__).resolve().parents[3] / "data" / "fees.json"
with FEES_FILE.open(encoding="utf-8") as source:
    FEES_DATA = json.load(source)


def calculate(pages: int, validity_years: int, delivery: str) -> dict:
    row = next((item for item in FEES_DATA["fees"] if
                item["pages"] == pages and
                item["validity_years"] == validity_years and
                item["delivery"] == delivery), None)
    if row is None:
        raise ValueError("This passport fee combination is not listed by the official portal.")

    total = int(row["total"])
    # Published values include 15% VAT; recover the net fee from the inclusive total.
    base = round(total / (1 + FEES_DATA["vat_rate"]))
    vat = total - base
    return {
        "base": base,
        "vat": vat,
        "total": total,
        "currency": FEES_DATA["currency"],
        "source_url": FEES_DATA["source_url"],
        "last_verified": FEES_DATA["last_verified"],
        "timeline_note": FEES_DATA["delivery_timelines"][delivery],
        "fees_include_vat": True,
    }
