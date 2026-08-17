import re
with open("frontend/src/routes/dashboard.tsx", "r") as f:
    content = f.read()

content = content.replace('import { fetchServerSession, logoutUser, UserSession, DEFAULT_ADMIN } from "@/lib/auth";', 'import { fetchServerSession, logoutUser, UserSession } from "@/lib/auth";')
content = content.replace('const [currentUser, setUser] = useState<UserSession>(DEFAULT_ADMIN);', 'const [currentUser, setUser] = useState<UserSession | null>(null);\n  const [loadingUser, setLoadingUser] = useState(true);')

block = """  useEffect(() => {
    fetchServerSession().then((usr) => {
      if (!usr) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(usr);
    });
  }, [navigate]);"""

new_block = """  useEffect(() => {
    fetchServerSession().then((usr) => {
      if (!usr) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(usr);
      setLoadingUser(false);
    });
  }, [navigate]);"""

content = content.replace("""  useEffect(() => {
    fetchServerSession().then((usr) => {
      if (!usr) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(usr);
    });
  }, [navigate]);""", new_block)

content = content.replace('if (currentUser.email === DEFAULT_ADMIN.email) {', 'if (currentUser && currentUser.role === "superadmin") {')
content = content.replace('currentUser.email === DEFAULT_ADMIN.email', 'currentUser?.role === "superadmin"')

# return null if loadingUser
ret_block = """  return (
    <div className="flex min-h-screen w-full flex-col bg-[#090D16] md:flex-row">"""
new_ret_block = """  if (loadingUser || !currentUser) {
    return <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">Caricamento...</div>;
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#090D16] md:flex-row">"""
content = content.replace(ret_block, new_ret_block)

with open("frontend/src/routes/dashboard.tsx", "w") as f:
    f.write(content)
