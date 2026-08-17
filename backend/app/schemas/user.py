from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, UUID4, ConfigDict
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.TECHNICIAN
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    company_id: Optional[UUID4] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: UUID4
    company_id: UUID4
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company_name: Optional[str] = "BaseGrid Enterprise"


class SessionUserResponse(BaseModel):
    id: str
    email: str
    fullName: str
    role: str
    companyId: str
    companyName: str
    provider: str = "local"
