#!/bin/sh
set -e

echo "🚀 Starting application initialization..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until pg_isready -h "${DB_HOST:-postgres-service-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}"; do
  echo "   Database is not ready yet..."
  sleep 2
done
echo "✅ Database is ready!"

# Run migrations if they exist
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null | grep -E '^[0-9]')" ]; then
    echo "🔄 Running database migrations..."
    # Fails closed. `migrate deploy` does not fail on migrations that are already
    # applied, so a failure is real: a failed migration or an unreachable
    # database. Starting anyway runs the code against a schema that is behind it,
    # and the error shows up later, far from its cause. The restart policy
    # retries, and `npx prisma migrate status` says what is pending.
    #
    # Prisma serializes `migrate deploy` with a session lock it never releases:
    # the lock ends with the session. Behind pgbouncer in transaction mode the
    # session outlives the command, so the lock stays on a pooled connection,
    # the next migration that lands on another one times out, and it serializes
    # nothing anyway. It is off through pgbouncer. MIGRATE_DATABASE_URL sends
    # the migration straight to Postgres, where the lock works: set it when more
    # than one server replica can start at once.
    MIGRATE_URL="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
    migrate() {
        case "$MIGRATE_URL" in
            *pgbouncer*) PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy ;;
            *) DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy ;;
        esac
    }
    if ! migrate; then
        echo "❌ Migration failed: the server does not start with the schema behind the code."
        exit 1
    fi
    echo "✅ Migrations completed"
else
    echo "ℹ️  No migrations found (using db push mode)"
fi

# Seed execution based on environment and configuration
# Check if seeds should run (can be controlled by environment variables)
if [ "$SKIP_SEEDS" = "true" ]; then
    echo "ℹ️  Skipping seeds (SKIP_SEEDS=true)"
elif [ -n "$SEED_ONLY" ]; then
    # Run specific seeds only
    echo "🌱 Running specific seeds: $SEED_ONLY"
    SEED_ONLY="$SEED_ONLY" npm run db:seed || {
        echo "⚠️  Seeds failed, but continuing"
    }
elif [ -n "$SEED_COMMAND" ]; then
    # Run custom seed command
    echo "🌱 Running custom seed command: $SEED_COMMAND"
    eval "$SEED_COMMAND" || {
        echo "⚠️  Seeds failed, but continuing"
    }
elif [ "$NODE_ENV" = "production" ]; then
    # Production: only run if explicitly requested
    if [ "$RUN_SEEDS" = "true" ]; then
        echo "🌱 Running production seeds..."
        npm run db:seed || {
            echo "⚠️  Seeds failed, but continuing"
        }
    else
        echo "ℹ️  Skipping seeds in production (set RUN_SEEDS=true to enable)"
    fi
elif [ "$NODE_ENV" = "staging" ]; then
    # Staging: seeds are controlled by deployment process
    # DO NOT run seeds automatically - they are handled by deploy.sh
    echo "ℹ️  Staging mode - seeds controlled by deployment process"
else
    # Development: run all seeds
    echo "🌱 Running development seeds..."
    npm run db:seed || {
        echo "⚠️  Seeds failed, but continuing"
    }
fi

echo "✅ Initialization complete, starting server..."

# Execute the main command
exec "$@"
