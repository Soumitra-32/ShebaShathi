"""Deterministic multi-service fee schedules loaded from a verified local data file.

The catalog is the only source of fee amounts used by the fee checker. It is
read from ``data/fee_schedules.json`` (version-controlled, one entry per
official source with a verification date) and fails closed when the file or a
required field is missing. No fee is ever computed by a language model and no
fee is inferred from a neighbouring service.
"""
import json
from pathlib import Path
from typing import Any, Dict, List

SCHEDULES_FILE = Path(__file__).resolve().parents[3] / "data" / "fee_schedules.json"

_REQUIRED_SERVICE_FIELDS = (
    "service_id", "label_bn", "label_en", "available", "source_url", "last_verified",
)
_REQUIRED_RULE_FIELDS = ("id", "selection", "components", "total")


def _load() -> Dict[str, Any]:
    try:
        with SCHEDULES_FILE.open(encoding="utf-8") as source:
            data = json.load(source)
    except FileNotFoundError as exc:
        raise RuntimeError("The verified fee schedule file is missing.") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("The verified fee schedule file is not valid JSON.") from exc

    services = data.get("services")
    if not isinstance(services, list) or not services:
        raise RuntimeError("The verified fee schedule file has no services.")
    for service in services:
        for field in _REQUIRED_SERVICE_FIELDS:
            if field not in service:
                raise RuntimeError(f"Fee schedule service '{service.get('service_id')}' is missing '{field}'.")
        if not str(service["source_url"]).startswith("https://"):
            raise RuntimeError(f"Fee schedule service '{service['service_id']}' has an invalid source URL.")
        if not str(service["last_verified"]).strip():
            raise RuntimeError(f"Fee schedule service '{service['service_id']}' has no verification date.")
        for rule in service.get("fee_rules", []):
            for field in _REQUIRED_RULE_FIELDS:
                if field not in rule:
                    raise RuntimeError(f"Fee rule '{rule.get('id')}' is missing '{field}'.")
            components_total = sum(int(part.get("amount", 0)) for part in rule["components"])
            if components_total != int(rule["total"]):
                raise RuntimeError(f"Fee rule '{rule['id']}' components do not add up to its total.")
    return data


DATA = _load()
SERVICES: Dict[str, Dict[str, Any]] = {service["service_id"]: service for service in DATA["services"]}


def catalog() -> Dict[str, Any]:
    """Public, non-sensitive fee catalog (labels, parameters, rules, sources)."""
    return {
        "catalog_version": DATA.get("catalog_version"),
        "currency": DATA.get("currency", "BDT"),
        "last_updated": DATA.get("last_updated"),
        "notes_bn": DATA.get("notes_bn", ""),
        "notes_en": DATA.get("notes_en", ""),
        "services": DATA["services"],
    }


def _parameter_ids(service: Dict[str, Any]) -> List[str]:
    return [parameter["id"] for parameter in service.get("parameters", [])]


def _matching_rule(service: Dict[str, Any], selection: Dict[str, str]) -> Dict[str, Any] | None:
    for rule in service.get("fee_rules", []):
        if all(str(selection.get(key, "")) == str(value) for key, value in rule["selection"].items()):
            return rule
    return None


def calculate(service_id: str, selection: Dict[str, Any]) -> Dict[str, Any]:
    """Return the official fee breakdown for one service selection.

    Raises ``ValueError`` when the service is unknown, unavailable, or the
    selected combination is not published by the official schedule.
    """
    service = SERVICES.get(service_id)
    if service is None:
        raise ValueError("The requested fee service is not available.")
    if not service.get("available"):
        raise ValueError("This service has no verified fee schedule. Check the official portal.")

    allowed = set(_parameter_ids(service))
    unknown = sorted(set(selection) - allowed)
    if unknown:
        raise ValueError("Unsupported fee parameter.")

    normalised: Dict[str, str] = {}
    for key, value in selection.items():
        if value is None:
            continue
        normalised[key] = str(value).strip()

    for parameter in service.get("parameters", []):
        # Only parameters that apply to the current selection are validated.
        conditions = parameter.get("applies_when") or {}
        if any(str(normalised.get(key, "")) != str(value) for key, value in conditions.items()):
            continue
        if parameter.get("type") == "number":
            raw = normalised.get(parameter["id"])
            if raw is None or raw == "":
                continue
            try:
                number = int(raw)
            except ValueError as exc:
                raise ValueError("A fee parameter must be a whole number.") from exc
            if number < int(parameter.get("min", 0)) or number > int(parameter.get("max", 10_000)):
                raise ValueError("A fee parameter is outside the published range.")
            normalised[parameter["id"]] = str(number)
        if parameter.get("type") == "select":
            allowed_values = {option["value"] for option in parameter.get("options", [])}
            if normalised.get(parameter["id"], "") not in allowed_values:
                raise ValueError("A fee option is not published for this service.")

    rule = _matching_rule(service, normalised)
    if rule is None:
        raise ValueError("This fee combination is not listed by the official schedule.")

    components = [
        {
            "id": part["id"],
            "label_bn": part.get("label_bn", ""),
            "label_en": part.get("label_en", ""),
            "amount": int(part.get("amount", 0)),
        }
        for part in rule["components"]
    ]
    total = sum(part["amount"] for part in components)

    for variable in rule.get("variable_components", []):
        units = int(normalised.get(variable.get("unit_field", ""), 0) or 0)
        if units >= int(variable.get("min_units", 1)):
            amount = int(variable["amount_per_unit"]) * units
            components.append({
                "id": variable["id"],
                "label_bn": variable.get("label_bn", ""),
                "label_en": variable.get("label_en", ""),
                "amount": amount,
            })
            total += amount

    return {
        "service_id": service["service_id"],
        "service_label_bn": service["label_bn"],
        "service_label_en": service["label_en"],
        "rule_id": rule["id"],
        "components": components,
        "total": total,
        "currency": DATA.get("currency", "BDT"),
        "notes_bn": rule.get("notes_bn", ""),
        "notes_en": rule.get("notes_en", ""),
        "scope_note_bn": service.get("scope_note_bn", ""),
        "scope_note_en": service.get("scope_note_en", ""),
        "source_url": service["source_url"],
        "last_verified": service["last_verified"],
    }
