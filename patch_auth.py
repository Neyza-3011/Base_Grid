import sys

with open("backend/app/api/v1/endpoints/auth.py", "r") as f:
    content = f.read()

# Replace return Token to return SessionUserResponse
content = content.replace("response_model=Token", "response_model=SessionUserResponse")

content = content.replace("""    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }""", """    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == user.company_id))
    company_obj = comp.scalar_one_or_none()
    company_name = company_obj.name if company_obj else "BaseGrid Enterprise"
    
    return SessionUserResponse(
        id=str(user.id),
        email=user.email,
        fullName=user.full_name,
        role=user.role.value,
        companyId=str(user.company_id),
        companyName=company_name,
        provider=getattr(user, "provider", "local"),
    )""")

with open("backend/app/api/v1/endpoints/auth.py", "w") as f:
    f.write(content)
