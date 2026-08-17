import re
with open("backend/app/api/v1/endpoints/users.py", "r") as f:
    content = f.read()

content = content.replace("from app.schemas.user import UserResponse, UserCreate", "from app.schemas.user import UserResponse, UserCreate, UserUpdate")

put_endpoint = """
@router.put("/me", response_model=UserResponse)
async def update_me(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    if user_in.email is not None and user_in.email != current_user.email:
        result = await db.execute(select(User).where(User.email == user_in.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address already exists.",
            )
        current_user.email = user_in.email

    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    
    if user_in.password is not None and user_in.password.strip():
        current_user.hashed_password = get_password_hash(user_in.password)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user
"""

content = content.replace("@router.post(\"/\",", put_endpoint + "\n@router.post(\"/\",")

with open("backend/app/api/v1/endpoints/users.py", "w") as f:
    f.write(content)
