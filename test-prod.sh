#!/bin/bash
set -e

# ==============================================================================
# BaseGrid - Local Production-Build Artifact Smoke Test
# ==============================================================================
# WARNING: This script is exclusively for LOCAL SMOKE TESTING of compiled artifacts.
# DO NOT RUN THIS IN A PRODUCTION ENVIRONMENT OR AGAINST PRODUCTION DATABASES.
# It uses ephemeral, dummy local-only values to verify process binding and API routes.
# ==============================================================================

# Stop previous server if any
pkill -f "dist/server.cjs" || true

# Start server in background with dummy local test environment
export NODE_ENV=production
export PORT=10006
export SKIP_DB_INIT=true
export JWT_SECRET=test-local-dummy-jwt-secret-do-not-use-in-production-min32chars
export SUPERADMIN_EMAIL=admin.smoke.test@basegrid.local
export SUPERADMIN_PASSWORD=SmokeTestPassword123!
export FRONTEND_URL=https://smoke-test.local
export CORS_ORIGINS=https://smoke-test.local
export REDIS_URL=redis://127.0.0.1:6379
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/basegrid
export EMAIL_VERIFICATION_ENABLED=false
export GOOGLE_AUTH_ENABLED=false

npm start > server.log 2>&1 &
SERVER_PID=$!

sleep 4

# Check health
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:10006/api/v1/auth/csrf-token

echo "Running registration..."
RES=$(curl -s -i -X POST http://127.0.0.1:10006/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "smoke.user@basegrid.local", "password": "ProdPassword123!", "full_name": "Smoke User", "company_name": "Smoke Co"}')

echo "$RES" | head -n 1

# Extract cookies
COOKIES=$(echo "$RES" | grep -i "set-cookie" || true)
ACCESS_TOKEN=$(echo "$COOKIES" | grep -i "access_token" | sed 's/.*access_token=\([^;]*\);.*/\1/' || true)
CSRF_TOKEN=$(echo "$COOKIES" | grep -i "csrf_token" | sed 's/.*csrf_token=\([^;]*\);.*/\1/' || true)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "No access token received!"
  kill $SERVER_PID
  exit 1
fi

echo "Access Token received."

echo "Testing authenticated GET (reports)..."
GET_RES=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:10006/api/v1/reports \
  -H "Cookie: access_token=$ACCESS_TOKEN")

if [ "$GET_RES" != "200" ]; then
  echo "GET failed with code $GET_RES"
  kill $SERVER_PID
  exit 1
fi
echo "Authenticated GET passed."

kill $SERVER_PID
echo "Production flow passed!"
