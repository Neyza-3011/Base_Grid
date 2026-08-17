import re

with open("frontend/src/routes/dashboard.tsx", "r") as f:
    content = f.read()

# Add import
content = content.replace('import { CompanySettings } from "@/components/dashboard/CompanySettings";', 'import { CompanySettings } from "@/components/dashboard/CompanySettings";\nimport { ReportsView } from "@/components/dashboard/ReportsView";')

# Update navigation
content = content.replace('action: () => toast.info("Sezione Rapportini in fase di sviluppo.")', 'action: () => setActiveView("reports"), a: activeView === "reports"')

# Update main area
content = content.replace('{activeView === "company_settings" && <CompanySettings />}', '{activeView === "company_settings" && <CompanySettings />}\n          {activeView === "reports" && <ReportsView />}')

# Delete the old REPORTS constant (if we want, or just leave it)

with open("frontend/src/routes/dashboard.tsx", "w") as f:
    f.write(content)
