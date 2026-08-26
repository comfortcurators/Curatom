from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Literal

Classification = Literal["public", "internal", "confidential", "restricted"]
Region = Literal["IN", "EU", "UK", "CN", "US", "SG", "AU"]


class AtomProfile(BaseModel):
    format: str
    retention_window_hours: int
    accuracy_tolerance: str
    system_persona: str
    max_output_tokens: int
    permitted_regions: List[Region] = Field(default_factory=lambda: ["IN", "EU", "US", "SG"])
    classification_ceiling: Classification = "internal"
    version: int = 1


class AtomCreate(BaseModel):
    name: str
    model_family: str
    role: str
    description: str
    profile: AtomProfile


class AtomProfileUpdate(BaseModel):
    profile: AtomProfile
    expected_version: int


class MemoryCreate(BaseModel):
    topic: str
    content: str
    region: Region = "SG"
    classification: Classification = "internal"
    subject_ids: List[str] = Field(default_factory=list)

    @field_validator("region", mode="before")
    @classmethod
    def normalize_region(cls, value: str) -> str:
        return value.upper().strip() if isinstance(value, str) else value

    @field_validator("classification", mode="before")
    @classmethod
    def normalize_classification(cls, value: str) -> str:
        return value.lower().strip() if isinstance(value, str) else value


class RecallRequest(BaseModel):
    atom_id: str
    memory_id: str
    query: str


class BatchRecallRequest(BaseModel):
    items: List[RecallRequest]


class IdentifyRequest(BaseModel):
    model_family_hint: Optional[str] = None
    sample_response: Optional[str] = None


class ChatRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = None
