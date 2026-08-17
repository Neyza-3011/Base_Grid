with open("frontend/src/routes/billing.tsx", "r") as f:
    content = f.read()

content = content.replace('import { getCurrentUser, UserSession } from "@/lib/auth";', 'import { fetchServerSession, UserSession } from "@/lib/auth";')

block = """  useEffect(() => {
    const usr = getCurrentUser();
    if (usr) {
      setCurrentUser(usr);
    }
  }, []);"""
new_block = """  useEffect(() => {
    fetchServerSession().then((usr) => {
      if (usr) {
        setCurrentUser(usr);
      }
    });
  }, []);"""
content = content.replace(block, new_block)

with open("frontend/src/routes/billing.tsx", "w") as f:
    f.write(content)
