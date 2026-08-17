from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, UUID4, ConfigDict, Field, validator
import re
from app.models.report import ReportStatus


class MaterialItem(BaseModel):
    id: Optional[str] = None
    name: str
    quantity: float = Field(gt=0)
    unit: str = "pza"
    unit_price: float = Field(ge=0)


class ReportBase(BaseModel):
    client_id: UUID4
    date: date
    work_hours: float = Field(default=0.0, ge=0.0, le=24.0)
    travel_hours: float = Field(default=0.0, ge=0.0, le=24.0)
    notes: Optional[str] = None
    materials_used: List[MaterialItem] = []
    signature_base64: Optional[str] = None

    @validator("signature_base64")
    def validate_signature(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Strict validation: PNG base64 data URI format or raw base64 string
        pattern = r"^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$"
        if not re.match(pattern, v) and not re.match(r"^[A-Za-z0-9+/=]+$", v):
            raise ValueError("Invalid signature payload format. Must be a valid PNG base64 data URI.")
        if len(v) > 2_000_000:  # Max 2MB base64 size limit
            raise ValueError("Signature payload size exceeds 2MB limit.")
        return v

    @validator("notes")
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Basic HTML strip to prevent XSS
        sanitized = re.sub(r"<[^>]*>", "", v)
        return sanitized.strip()


class ReportCreate(ReportBase):
    status: ReportStatus = ReportStatus.DRAFT


class ReportUpdate(BaseModel):
    client_id: Optional[UUID4] = None
    date: Optional[date] = None
    work_hours: Optional[float] = Field(default=None, ge=0.0, le=24.0)
    travel_hours: Optional[float] = Field(default=None, ge=0.0, le=24.0)
    notes: Optional[str] = None
    materials_used: Optional[List[MaterialItem]] = None
    signature_base64: Optional[str] = None
    status: Optional[ReportStatus] = None


class ReportStatusUpdate(BaseModel):
    status: ReportStatus


class ClientSimple(BaseModel):
    id: UUID4
    name: str
    address: Optional[str] = None

class TechnicianSimple(BaseModel):
    id: UUID4
    full_name: str

class ReportResponse(ReportBase):
    id: UUID4
    company_id: UUID4
    technician_id: UUID4
    status: ReportStatus
    created_at: datetime
    updated_at: datetime
    client: Optional[ClientSimple] = None
    technician: Optional[TechnicianSimple] = None
    
    model_config = ConfigDict(from_attributes=True)
