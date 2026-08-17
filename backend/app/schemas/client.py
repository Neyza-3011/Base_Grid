from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, UUID4, ConfigDict


class ClientBase(BaseModel):
    name: str
    address: Optional[str] = None
    vat_number: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    phone: Optional[str] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    vat_number: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    phone: Optional[str] = None


class ClientResponse(ClientBase):
    id: UUID4
    company_id: UUID4
    is_deleted: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
