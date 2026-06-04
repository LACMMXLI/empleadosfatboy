#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required."
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "JWT_SECRET is required."
  exit 1
fi

node apps/api/scripts/wait-for-database.cjs
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
node apps/api/dist/main.js
