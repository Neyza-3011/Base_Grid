import re

with open("backend/app/schemas/report.py", "r") as f:
    content = f.read()

new_classes = """
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
"""

content = re.sub(r'class ReportResponse\(ReportBase\):.*?model_config = ConfigDict\(from_attributes=True\)', new_classes.strip(), content, flags=re.DOTALL)

with open("backend/app/schemas/report.py", "w") as f:
    f.write(content)
