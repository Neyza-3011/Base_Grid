import re
with open("frontend/src/components/dashboard/ProfileSettings.tsx", "r") as f:
    content = f.read()

content = re.sub(r'const currentStorage = JSON\.parse\(localStorage\.getItem\(STORAGE_KEY\) \|\| "{}"\);\n\s*localStorage\.setItem\([\s\S]*?\);', '// no local storage', content)

with open("frontend/src/components/dashboard/ProfileSettings.tsx", "w") as f:
    f.write(content)
