import asyncio
import os
import sys
import re

# Add backend to Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy import text
from app.core.database import engine


def sanitize_url(url: str) -> str:
    if not url:
        return "None"
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", url)


async def test_connection():
    db_url = os.environ.get("DATABASE_URL", "")
    print("========================================")
    print("🔍 DIAGNOSTICA CONNESSIONE DATABASE 🔍")
    print("========================================")
    print(f"URL Originale    : {sanitize_url(db_url)}")
    print(f"URL Normalizzato : {sanitize_url(str(engine.url))}")
    print("========================================")

    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            val = result.scalar()
            print(f"✅ SUCCESSO: Connessione al database stabilita! Risultato query: {val}")
    except Exception as e:
        print(f"❌ ERRORE: La connessione al database e' fallita!\n\nDettagli errore: {type(e).__name__}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_connection())
