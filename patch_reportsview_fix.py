with open("frontend/src/components/dashboard/ReportsView.tsx", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "      </div>" in line or "    </div>" in line or "  );" in line or "}" in line or "{previewReportId &&" in line:
        pass
    else:
        new_lines.append(line)

