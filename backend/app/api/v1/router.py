from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, clients, materials, reports, company, admin

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(company.router, prefix="/company", tags=["company"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])

