import re
with open("frontend/src/lib/reportsStorage.ts", "r") as f:
    content = f.read()

content = content.replace("""      }).catch(() => {});
    }
  } catch {""", """      }).catch(() => {});
  } catch {""")

content = content.replace("""        }
      }
  } catch {
    // Ignore backend fetch error
  }""", """        }
      }
    }
  } catch {
    // Ignore backend fetch error
  }""")

with open("frontend/src/lib/reportsStorage.ts", "w") as f:
    f.write(content)
