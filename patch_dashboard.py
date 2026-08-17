import re

with open("frontend/src/routes/dashboard.tsx", "r") as f:
    content = f.read()

new_imports = """
import { ProfileSettings } from "@/components/dashboard/ProfileSettings";
import { CompanySettings } from "@/components/dashboard/CompanySettings";
"""

content = content.replace('import { toast } from "sonner";', 'import { toast } from "sonner";' + new_imports)

with open("frontend/src/routes/dashboard.tsx", "w") as f:
    f.write(content)
