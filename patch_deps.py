import re
with open("backend/app/api/deps.py", "r") as f:
    content = f.read()

content = content.replace("""    if not token:
        token = request.cookies.get("access_token")
        if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )""", """    if not token:
        token = request.cookies.get("access_token")
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication credentials were not provided.",
                headers={"WWW-Authenticate": "Bearer"},
            )""")

with open("backend/app/api/deps.py", "w") as f:
    f.write(content)
