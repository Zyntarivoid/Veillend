#!/bin/sh
set -e

# Run pending Prisma migrations (idempotent – safe on every start)
echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting VeilLend backend..."
exec "$@"
