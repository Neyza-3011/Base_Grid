import re

with open("frontend/src/components/dashboard/ReportsView.tsx", "r") as f:
    content = f.read()

# Import PdfPreviewModal
content = content.replace(
    'import { STORAGE_KEY } from "@/lib/auth";',
    'import { STORAGE_KEY } from "@/lib/auth";\nimport { PdfPreviewModal } from "./PdfPreviewModal";'
)

# Add state for selected PDF
content = content.replace(
    'const [activeFilter, setActiveFilter] = useState("Tutti");',
    'const [activeFilter, setActiveFilter] = useState("Tutti");\n  const [previewReportId, setPreviewReportId] = useState<string | null>(null);'
)

# Replace handleDownload with opening modal
content = content.replace(
    'const handleDownload = async (id: string) => {',
    'const handleDownload = (id: string) => {\n    setPreviewReportId(id);\n  };\n\n  const _oldHandleDownload = async (id: string) => {'
)

# Render PdfPreviewModal at the end of the return statement
content = content.replace(
    '</div>\n    </div>\n  );\n}',
    '</div>\n      </div>\n      {previewReportId && <PdfPreviewModal reportId={previewReportId} onClose={() => setPreviewReportId(null)} />}\n    </div>\n  );\n}'
)

with open("frontend/src/components/dashboard/ReportsView.tsx", "w") as f:
    f.write(content)
