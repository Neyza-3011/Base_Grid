with open("frontend/src/components/dashboard/ProfileSettings.tsx", "r") as f:
    lines = f.readlines()

del lines[100] # Line 101 is index 100

with open("frontend/src/components/dashboard/ProfileSettings.tsx", "w") as f:
    f.writelines(lines)
