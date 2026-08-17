with open("frontend/src/components/landing/Nav.tsx", "r") as f:
    content = f.read()

content = content.replace("import { getCurrentUser, logoutUser, UserSession } from \"@/lib/auth\";", "import { fetchServerSession, logoutUser, UserSession } from \"@/lib/auth\";")
content = content.replace("setCurrentUser(getCurrentUser());", "fetchServerSession().then(setCurrentUser);")

with open("frontend/src/components/landing/Nav.tsx", "w") as f:
    f.write(content)
