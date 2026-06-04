#!/bin/sh
set -e

npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
node apps/api/dist/main.js
