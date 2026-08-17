import asyncio
import pytest
import sys

if __name__ == "__main__":
    sys.exit(pytest.main(["backend/tests/test_auth.py", "backend/tests/test_csrf.py"]))
