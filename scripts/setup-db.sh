#!/usr/bin/env bash
set -euo pipefail

# Create the project database if it doesn't exist.
# Idempotent — safe to run on every deploy.
# Reads DB connection info from .env file.

if [[ ! -f .env ]]; then
    echo "No .env file found, skipping database setup."
    exit 0
fi

# Extract connection details from DATABASE_URL in .env
DB_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)

if [[ -z "${DB_URL}" ]]; then
    echo "DATABASE_URL not found in .env, skipping database setup."
    exit 0
fi

# Parse DATABASE_URL: postgresql://user:pass@host:port/dbname?params
DB_USER=$(echo "${DB_URL}" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "${DB_URL}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "${DB_URL}" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "${DB_URL}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "${DB_URL}" | sed -n 's|.*/\([^?]*\).*|\1|p')

if [[ -z "${DB_NAME}" || -z "${DB_HOST}" ]]; then
    echo "Could not parse DATABASE_URL, skipping database setup."
    exit 0
fi

# For pgbouncer connections, use the postgres container directly for admin commands
ADMIN_HOST="${DB_HOST}"
ADMIN_PORT="${DB_PORT}"
if echo "${DB_HOST}" | grep -q "pgbouncer"; then
    ADMIN_HOST=$(echo "${DB_HOST}" | sed 's/pgbouncer/postgres/')
    ADMIN_PORT=5432
fi

echo "Checking if database '${DB_NAME}' exists on ${ADMIN_HOST}:${ADMIN_PORT}..."

# Check if DB exists, create if not
EXISTS=$(docker exec postgres-service-postgres psql -U "${DB_USER}" -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null || echo "")

if [[ "${EXISTS}" == "1" ]]; then
    echo "Database '${DB_NAME}' already exists."
else
    echo "Creating database '${DB_NAME}'..."
    docker exec postgres-service-postgres psql -U "${DB_USER}" -c "CREATE DATABASE \"${DB_NAME}\";"
    echo "Database '${DB_NAME}' created."
fi

# Ensure required extensions (idempotent)
echo "Ensuring database extensions..."
docker exec postgres-service-postgres psql -U "${DB_USER}" -d "${DB_NAME}" -c \
    "CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;" 2>/dev/null || true
