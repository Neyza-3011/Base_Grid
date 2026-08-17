import re
with open("frontend/src/lib/reportsStorage.ts", "r") as f:
    content = f.read()

content = content.replace('import { STORAGE_KEY } from "./auth";\n', "")

# Replace fetch blocks entirely
block1 = """    const tokenObj = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (tokenObj?.token) {
      const res = await fetch("/api/v1/reports?limit=1000", {
        headers: {
          Authorization: `Bearer ${tokenObj.token}`,
        },
      });"""

new_block1 = """      const res = await fetch("/api/v1/reports?limit=1000", {
        credentials: "include",
        headers: {},
      });"""

content = content.replace(block1, new_block1)

# Now there is an extra '}' that closed the 'if (tokenObj?.token) {'.
# Let's see the end of that try block.
content = content.replace("""        }
      }
    }
  } catch {
    // Ignore backend fetch error
  }""", """        }
      }
  } catch {
    // Ignore backend fetch error
  }""")


block2 = """    const tokenObj = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (tokenObj?.token) {
      await fetch("/api/v1/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenObj.token}`,
        },"""

new_block2 = """      await fetch("/api/v1/reports", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },"""

content = content.replace(block2, new_block2)
content = content.replace("""        }).catch(() => {});
    }
  } catch {
    // Ignore error
  }""", """        }).catch(() => {});
  } catch {
    // Ignore error
  }""")

block3 = """    const tokenObj = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (tokenObj?.token) {
      await fetch(`/api/v1/reports/${reportId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenObj.token}`,
        },
      }).catch(() => {});
    }"""

new_block3 = """      await fetch(`/api/v1/reports/${reportId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {},
      }).catch(() => {});"""

content = content.replace(block3, new_block3)

with open("frontend/src/lib/reportsStorage.ts", "w") as f:
    f.write(content)
