from datetime import datetime
from typing import Optional
from pydantic import BaseModel, UUID4, ConfigDict

class CompanyBase(BaseModel):
    name: str
    vat_number: Optional[str] = None
    address: Optional[str] = None
    default_hourly_rate: Optional[float] = None
    report_footer_notes: Optional[str] = None

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    vat_number: Optional[str] = None
    address: Optional[str] = None
    default_hourly_rate: Optional[float] = None
    report_footer_notes: Optional[str] = None

class CompanyResponse(CompanyBase):
    id: UUID4
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_subscription_status: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
