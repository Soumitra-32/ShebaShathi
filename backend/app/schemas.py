"""
Pydantic schemas for request/response validation.
"""
import re
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Any, Dict, Optional, List, Literal

_ANSWER_FIELD_RE = re.compile(r"^[a-z][a-z0-9_]{0,40}$")


class FeeCalculateRequest(BaseModel):
    pages: Literal[48, 64]
    validity_years: Literal[5, 10]
    delivery: Literal["regular", "express", "super_express"] = "regular"


class FeeCalculateResponse(BaseModel):
    base: float
    vat: float
    total: float
    currency: str
    source_url: str
    last_verified: str
    timeline_note: str
    fees_include_vat: bool


class ServiceProfile(BaseModel):
    applicant_type: Literal["first_time_adult", "minor", "renewal", "lost_passport"]
    age: Optional[int] = Field(default=None, ge=0, le=120)
    pages: Optional[Literal[48, 64]] = None
    validity_years: Optional[Literal[5, 10]] = None
    delivery: Literal["regular", "express", "super_express"] = "regular"
    has_nid: bool = False
    language: Literal["bn", "en"] = "bn"

    @model_validator(mode="after")
    def validate_official_applicant_limits(self):
        if self.applicant_type == "minor":
            if self.age is not None and self.age >= 18:
                raise ValueError("Minor applicants must be under 18.")
            if self.pages not in (None, 48) or self.validity_years not in (None, 5):
                raise ValueError("Applicants under 18 are limited to 48 pages and 5-year validity.")
        if self.applicant_type == "first_time_adult" and self.age is not None and self.age < 18:
            raise ValueError("First-time adult applicants must be at least 18.")
        return self


class ChecklistRequest(BaseModel):
    profile: ServiceProfile


class DocEntry(BaseModel):
    id: str
    label_bn: str
    label_en: str
    required: bool
    notes_bn: str
    notes_en: str
    source_url: str
    last_verified: str


class ChecklistResponse(BaseModel):
    documents: List[DocEntry]
    steps: List[str]
    payment_channels: List[str]
    warnings: List[str]
    source_url: str
    last_verified: str
    payment_source_url: str
    payment_last_verified: str


class Citation(BaseModel):
    title: str
    url: str
    last_verified: str
    quote_snippet: str


class RetrievedChunk(BaseModel):
    id: str
    score: float
    section: str


class CopilotAnswer(BaseModel):
    answer: str
    citations: List[Citation]
    grounded: bool
    retrieved_chunks: List[RetrievedChunk] = Field(default_factory=list)
    generation_mode: str = "extractive"
    llm_provider: str = "none"
    llm_model: Optional[str] = None
    safety_blocked: bool = False


class CopilotAskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000)
    profile: Optional[ServiceProfile] = None
    service_id: Optional[str] = Field(default=None, max_length=40)
    language: Literal["bn", "en"] = "bn"


class CopilotAskResponse(CopilotAnswer):
    pass


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=1000)


class CopilotChatRequest(BaseModel):
    """One turn of the conversational assistant.

    History is supplied by the browser and is never stored server-side.
    Identity-like numbers are rejected before any model call.
    """

    model_config = ConfigDict(extra="forbid")

    question: str = Field(..., min_length=2, max_length=1000)
    history: List[ChatTurn] = Field(default_factory=list, max_length=8)
    service_id: Optional[str] = Field(default=None, max_length=40)
    language: Literal["bn", "en"] = "bn"
    profile: Optional[ServiceProfile] = None

    @field_validator("question")
    @classmethod
    def require_non_whitespace(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Ask a question in a few words.")
        return cleaned


class CopilotChatResponse(CopilotAnswer):
    service_id: Optional[str] = None
    service_name_bn: Optional[str] = None
    service_name_en: Optional[str] = None
    suggested_questions: List[str] = Field(default_factory=list)


class CaseBriefResponse(BaseModel):
    brief: str
    grounded: bool
    generation_mode: str
    llm_provider: str = "none"
    llm_model: Optional[str] = None
    source_url: str
    last_verified: str


class RedFlagCheckRequest(BaseModel):
    claimed_amount: float = Field(..., ge=0, allow_inf_nan=False)
    pages: Literal[48, 64] = 48
    validity_years: Literal[5, 10] = 10
    delivery: Literal["regular", "express", "super_express"] = "regular"


class RedFlagCheckResponse(BaseModel):
    official_total: float
    difference: float
    difference_pct: float
    flag: bool
    message_bn: str
    source_url: str
    last_verified: str


class GRSDraftRequest(BaseModel):
    incident_date: str = Field(..., min_length=1, max_length=50)
    location: str = Field(..., min_length=1, max_length=200)
    misconduct_type: Literal["delay", "bribe_demand", "document_refusal", "other"]
    official_ref: Optional[str] = Field(default=None, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    language: Literal["bn", "en"] = "bn"

    @field_validator("incident_date")
    @classmethod
    def validate_incident_date(cls, value: str) -> str:
        cleaned = value.strip()
        try:
            parsed = date.fromisoformat(cleaned)
        except ValueError:
            try:
                parsed = datetime.strptime(cleaned, "%d %b %Y").date()
            except ValueError as exc:
                raise ValueError("Enter a valid incident date.") from exc
        if parsed > date.today():
            raise ValueError("The incident date cannot be in the future.")
        return cleaned

    @field_validator("location", "description")
    @classmethod
    def require_non_whitespace(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field cannot be blank.")
        return cleaned

    @field_validator("official_ref")
    @classmethod
    def trim_official_ref(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else None


class GRSDraftResponse(BaseModel):
    subject: str
    body: str
    disclaimer: str
    portal_url: str


class OfficialLink(BaseModel):
    label_bn: str
    label_en: str
    url: str


class ServiceChecklistRequest(BaseModel):
    """Minimal, non-sensitive answers for one service task.

    ``extra="forbid"`` and the per-field allowlist in ``validate_answers`` stop
    callers from smuggling identity numbers or unknown fields into the engine.
    """

    model_config = ConfigDict(extra="forbid")

    task: str = Field(..., min_length=1, max_length=60)
    answers: Dict[str, Any] = Field(default_factory=dict)
    language: Literal["bn", "en"] = "bn"

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if len(value) > 20:
            raise ValueError("Too many answer fields.")
        for key, item in value.items():
            if not isinstance(key, str) or not _ANSWER_FIELD_RE.match(key):
                raise ValueError("Unsupported answer field name.")
            if isinstance(item, bool):
                continue
            if isinstance(item, (int, float)):
                continue
            if isinstance(item, str):
                if len(item) > 120:
                    raise ValueError("An answer value is too long.")
                continue
            raise ValueError("Unsupported answer value type.")
        return value


class ServiceChecklistResponse(BaseModel):
    service_id: str
    task_id: str
    task_label_bn: str
    task_label_en: str
    documents: List[DocEntry]
    steps: List[str]
    warnings: List[str]
    official_links: List[OfficialLink]
    source_url: str
    last_verified: str
    review_status: str = "unknown"
    review_after_days: int = 180
    fallback_used: bool


class IntakeRequest(BaseModel):
    """Free-text intake.

    The text is untrusted input and is never stored. The endpoint rejects
    identity-like numbers before any model call; ``extra="forbid"`` stops
    callers from smuggling a profile or hidden prompt field into the request.
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(..., min_length=2, max_length=1000)
    language: Literal["bn", "en"] = "bn"
    # A user may confirm or correct the AI's service/task choice. Overrides are
    # validated against the enabled catalog; they never bypass the catalog.
    service_id: Optional[str] = Field(default=None, max_length=40)
    task_id: Optional[str] = Field(default=None, max_length=60)

    @field_validator("text")
    @classmethod
    def require_non_whitespace(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Describe what you need in a few words.")
        return cleaned


class IntakeOption(BaseModel):
    value: str
    label_bn: str
    label_en: str


class IntakeQuestion(BaseModel):
    field: str
    type: Literal["number", "select", "boolean"]
    required: bool = False
    min: Optional[float] = None
    max: Optional[float] = None
    label_bn: str
    label_en: str
    options: List[IntakeOption] = Field(default_factory=list)


class IntakeResponse(BaseModel):
    blocked: bool = False
    generation_mode: str = "rules"
    fallback_used: bool = False
    confidence: float = 0.0
    service_id: Optional[str] = None
    service_name_bn: Optional[str] = None
    service_name_en: Optional[str] = None
    task_id: Optional[str] = None
    task_label_bn: Optional[str] = None
    task_label_en: Optional[str] = None
    answers: Dict[str, Any] = Field(default_factory=dict)
    missing_fields: List[str] = Field(default_factory=list)
    questions: List[IntakeQuestion] = Field(default_factory=list)
    service_options: List[IntakeOption] = Field(default_factory=list)
    task_options: List[IntakeOption] = Field(default_factory=list)
    message_bn: str = ""
    message_en: str = ""
    message: str = ""
