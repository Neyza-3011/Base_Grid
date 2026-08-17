import re

with open("frontend/src/routes/admin/super-dashboard.tsx", "r") as f:
    content = f.read()

content = content.replace("}, []);", "}, [navigate]);")

with open("frontend/src/routes/admin/super-dashboard.tsx", "w") as f:
    f.write(content)
