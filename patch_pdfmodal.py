import re

with open("frontend/src/components/dashboard/PdfPreviewModal.tsx", "r") as f:
    content = f.read()

content = content.replace("}, [reportId]);", "}, [reportId, onClose, pdfUrl]);")

with open("frontend/src/components/dashboard/PdfPreviewModal.tsx", "w") as f:
    f.write(content)
