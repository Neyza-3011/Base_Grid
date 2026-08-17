from typing import Optional
from pydantic import BaseModel, UUID4, ConfigDict, Field


class MaterialBase(BaseModel):
    name: str
    unit: str = "pza"
    default_price: float = Field(default=0.0, ge=0.0)
    is_active: bool = True


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    default_price: Optional[float] = Field(default=None, ge=0.0)
    is_active: Optional[bool] = None


class MaterialResponse(MaterialBase):
    id: UUID4
    company_id: UUID4

    model_config = ConfigDict(from_attributes=True)
