import re

with open("frontend/src/routes/dashboard.tsx", "r") as f:
    content = f.read()

# find <main...> and replace with <main...>\n{activeView === 'dashboard' && (<>
content = re.sub(
    r'(<main className="flex-1 p-5 sm:p-8 space-y-6 overflow-x-hidden">)',
    r'\1\n          {activeView === "dashboard" && (\n            <>',
    content
)

# find </main> and replace with </>) } {activeView === ...} </main>
content = re.sub(
    r'(</main>)',
    r'            </>\n          )}\n          {activeView === "profile" && <ProfileSettings currentUser={currentUser} onUpdate={setUser} />}\n          {activeView === "company_settings" && <CompanySettings />}\n        \1',
    content
)

with open("frontend/src/routes/dashboard.tsx", "w") as f:
    f.write(content)
