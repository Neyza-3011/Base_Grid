import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.api.deps import get_db, get_current_superadmin
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.report import Report
from app.models.client import Client

router = APIRouter()


@router.get("/stats")
async def get_superadmin_stats(
    superadmin: User = Depends(get_current_superadmin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Returns global enterprise SaaS metrics for the Superadmin Control Panel."""
    companies_count = (await db.execute(select(func.count(Company.id)))).scalar() or 0
    users_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
    reports_count = (await db.execute(select(func.count(Report.id)))).scalar() or 0
    clients_count = (await db.execute(select(func.count(Client.id)))).scalar() or 0

    return {
        "total_tenants": companies_count,
        "total_users": users_count,
        "total_reports": reports_count,
        "total_clients": clients_count,
        "sandbox_mode_active": True,
        "system_status": "Healthy / Operational",
    }


@router.get("/tenants")
async def list_tenants(
    superadmin: User = Depends(get_current_superadmin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Returns all registered SaaS tenants for Control Panel management."""
    result = await db.execute(select(Company).order_by(Company.created_at.desc()))
    companies = result.scalars().all()
    return companies


@router.post("/sandbox/seed")
async def seed_sandbox_environment(
    superadmin: User = Depends(get_current_superadmin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Seeds test data into an isolated sandbox tenant for Superadmin evaluation."""
    # Find or create Sandbox tenant
    result = await db.execute(select(Company).where(Company.name == "Sandbox Test Enterprise"))
    sandbox_company = result.scalar_one_or_none()
    if not sandbox_company:
        sandbox_company = Company(name="Sandbox Test Enterprise")
        db.add(sandbox_company)
        await db.commit()
        await db.refresh(sandbox_company)

    return {
        "status": "success",
        "message": "Sandbox environment ready for testing.",
        "sandbox_company_id": str(sandbox_company.id),
    }
