import re
with open("frontend/src/components/dashboard/PdfPreviewModal.tsx", "r") as f:
    content = f.read()

content = content.replace('import { STORAGE_KEY } from "@/lib/auth";\n', "")
content = re.sub(r'\s*const tokenObj = JSON\.parse\(localStorage\.getItem\(STORAGE_KEY\) \|\| "{}"\);', "", content)
content = re.sub(r'\s*Authorization: `Bearer \$\{tokenObj\?\.token \|\| ""\}`,\n', "\n", content)
content = content.replace('fetch(`/api/v1/reports/${reportId}/pdf`, {', 'fetch(`/api/v1/reports/${reportId}/pdf`, {\n          credentials: "include",')

with open("frontend/src/components/dashboard/PdfPreviewModal.tsx", "w") as f:
    f.write(content)
