#!/bin/sh
set -eu
bundle=/run/secrets/neander_environment
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    DATABASE_URL=*) export DATABASE_URL=${line#DATABASE_URL=} ;;
    AUTH_SECRET=*) export AUTH_SECRET=${line#AUTH_SECRET=} ;;
  esac
done < "$bundle"
npx prisma migrate deploy
exec "$@"
