import uuid
from datetime import date
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from app.api.deps import get_db, get_current_user, get_current_active_admin
from app.models.user import User, UserRole
from app.models.client import Client
from app.models.report import Report, ReportStatus
from app.schemas.report import (
    ReportCreate,
    ReportUpdate,
    ReportStatusUpdate,
    ReportResponse,
)
from app.services.pdf import generate_report_pdf

router = APIRouter()


@router.get("/", response_model=List[ReportResponse])
async def list_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    report_status: Optional[ReportStatus] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    client_id: Optional[uuid.UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    # Build filtered query with company_id multi-tenant isolation
    conditions = [Report.company_id == current_user.company_id]

    # Non-admin technicians only view their own assigned reports unless admin
    if current_user.role == UserRole.TECHNICIAN:
        conditions.append(Report.technician_id == current_user.id)

    if report_status:
        conditions.append(Report.status == report_status)
    if start_date:
        conditions.append(Report.date >= start_date)
    if end_date:
        conditions.append(Report.date <= end_date)
    if client_id:
        conditions.append(Report.client_id == client_id)

    query = (
        select(Report)
        .options(joinedload(Report.client), joinedload(Report.technician))
        .where(and_(*conditions))
        .order_by(Report.date.desc(), Report.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    report_in: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    # Verify target client exists within same company
    client_res = await db.execute(
        select(Client)
        .where(Client.id == report_in.client_id)
        .where(Client.company_id == current_user.company_id)
        .where(Client.is_deleted == False)
    )
    if not client_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Specified client does not exist or belong to your company.",
        )

    materials_data = [item.model_dump() for item in report_in.materials_used]

    report = Report(
        company_id=current_user.company_id,
        client_id=report_in.client_id,
        technician_id=current_user.id,
        date=report_in.date,
        work_hours=report_in.work_hours,
        travel_hours=report_in.travel_hours,
        notes=report_in.notes,
        materials_used=materials_data,
        signature_base64=report_in.signature_base64,
        status=report_in.status,
    )

    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    query = select(Report).options(joinedload(Report.client), joinedload(Report.technician)).where(Report.id == report_id).where(Report.company_id == current_user.company_id)
    if current_user.role == UserRole.TECHNICIAN:
        query = query.where(Report.technician_id == current_user.id)

    result = await db.execute(query)
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@router.patch("/{report_id}/status", response_model=ReportResponse)
async def update_report_status(
    report_id: uuid.UUID,
    status_in: ReportStatusUpdate,
    current_admin: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(
        select(Report)
        .where(Report.id == report_id)
        .where(Report.company_id == current_admin.company_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    report.status = status_in.status
    await db.commit()
    await db.refresh(report)
    return report


@router.get("/{report_id}/pdf")
async def get_report_pdf_stream(
    report_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    # Query report with isolation
    query = select(Report).options(joinedload(Report.client), joinedload(Report.technician)).where(Report.id == report_id).where(Report.company_id == current_user.company_id)
    if current_user.role == UserRole.TECHNICIAN:
        query = query.where(Report.technician_id == current_user.id)

    result = await db.execute(query)
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    # Fetch Client
    client_res = await db.execute(select(Client).where(Client.id == report.client_id))
    client = client_res.scalar_one_or_none()

    # Fetch Technician
    tech_res = await db.execute(select(User).where(User.id == report.technician_id))
    technician = tech_res.scalar_one_or_none()

    pdf_buffer = generate_report_pdf(report, client, technician)

    headers = {
        "Content-Disposition": f"inline; filename=Rapportino_{report.date}_{report.id}.pdf"
    }

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers=headers,
    )
