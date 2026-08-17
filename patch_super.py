with open("frontend/src/routes/admin/super-dashboard.tsx", "r") as f:
    content = f.read()

content = content.replace(', DEFAULT_ADMIN, STORAGE_KEY', '')

block = """      const tokenObj = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const headers = { Authorization: `Bearer ${tokenObj?.token || ""}` };

      const [statsRes, tenantsRes] = await Promise.all([
        fetch("/api/v1/admin/stats", { headers }),
        fetch("/api/v1/admin/tenants", { headers }),
      ]);"""

new_block = """      const [statsRes, tenantsRes] = await Promise.all([
        fetch("/api/v1/admin/stats", { credentials: "include" }),
        fetch("/api/v1/admin/tenants", { credentials: "include" }),
      ]);"""

content = content.replace(block, new_block)

content = content.replace('if (usr.role !== "superadmin" && usr.email !== DEFAULT_ADMIN.email) {', 'if (usr.role !== "superadmin") {')
content = content.replace('if (currentUser.email === DEFAULT_ADMIN.email) {', 'if (currentUser.role === "superadmin") {')
content = content.replace('!usr || usr.email !== DEFAULT_ADMIN.email', '!usr || usr.role !== "superadmin"')

with open("frontend/src/routes/admin/super-dashboard.tsx", "w") as f:
    f.write(content)
