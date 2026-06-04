#!/bin/sh
set -e

if [ "$CONFIRM_RESET" != "YES" ]; then
  echo "This will DROP and recreate the database schema configured in DATABASE_URL."
  echo "Run with CONFIRM_RESET=YES to continue."
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required."
  exit 1
fi

if [ -f "apps/api/prisma/schema.prisma" ]; then
  SCHEMA_PATH="apps/api/prisma/schema.prisma"
  WAIT_SCRIPT="apps/api/scripts/wait-for-database.cjs"
else
  SCHEMA_PATH="prisma/schema.prisma"
  WAIT_SCRIPT="scripts/wait-for-database.cjs"
fi

node "$WAIT_SCRIPT"
npx prisma migrate reset --force --skip-seed --schema "$SCHEMA_PATH"
