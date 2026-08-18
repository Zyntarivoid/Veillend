#!/bin/sh
set -e

# Run Prisma migrations in production
echo "Running database migrations..."
npx prisma migrate deploy

# Start the application
echo "Starting VeilLend backend..."
exec node dist/main
