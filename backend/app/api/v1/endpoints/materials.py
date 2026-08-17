import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.material import Material
from app.schemas.material import MaterialCreate, MaterialUpdate, MaterialResponse

router = APIRouter()


@router.get("/", response_model=List[MaterialResponse])
async def list_materials(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(
        select(Material)
        .where(Material.company_id == current_user.company_id)
        .where(Material.is_active == True)
        .order_by(Material.name.asc())
    )
    return result.scalars().all()


@router.post("/", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def create_material(
    material_in: MaterialCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    material = Material(
        company_id=current_user.company_id,
        name=material_in.name,
        unit=material_in.unit,
        default_price=material_in.default_price,
        is_active=material_in.is_active,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


@router.put("/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: uuid.UUID,
    material_in: MaterialUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    result = await db.execute(
        select(Material)
        .where(Material.id == material_id)
        .where(Material.company_id == current_user.company_id)
    )
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found.")

    update_data = material_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(material, field, value)

    await db.commit()
    await db.refresh(material)
    return material
