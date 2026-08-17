with open("frontend/src/routes/admin/sandbox.tsx", "r") as f:
    content = f.read()

block = """  useEffect(() => {
    const usr = getCurrentUser();
    if (usr) setUser(usr);

    toast.info("Ambiente Cloned Sandbox attivo (Dati di test isolati).");
  }, []);"""

new_block = """  useEffect(() => {
    import("@/lib/auth").then(m => m.fetchServerSession()).then(usr => {
        if (usr) setUser(usr);
    });
    toast.info("Ambiente Cloned Sandbox attivo (Dati di test isolati).");
  }, []);"""

content = content.replace(block, new_block)

with open("frontend/src/routes/admin/sandbox.tsx", "w") as f:
    f.write(content)
