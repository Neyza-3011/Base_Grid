from typing import Optional
from pydantic import BaseModel, UUID4


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    company_id: Optional[UUID4] = None
    role: Optional[str] = None
    type: Optional[str] = None
