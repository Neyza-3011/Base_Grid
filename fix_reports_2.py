with open("frontend/src/lib/reportsStorage.ts", "r") as f:
    lines = f.readlines()

# let's just delete line 244 (index 243)
del lines[243]

with open("frontend/src/lib/reportsStorage.ts", "w") as f:
    f.writelines(lines)
