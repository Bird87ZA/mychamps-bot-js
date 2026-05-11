#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  npx prisma migrate deploy
else
  echo "DATABASE_URL is not set; skipping Prisma migrations."
fi

exec "$@"
