#!/bin/bash
# Run all migration files in order from the mounted migrations directory.
# This script is placed in docker-entrypoint-initdb.d and runs after
# 00-extensions.sql (which creates the required extensions).

set -e

MIGRATIONS_DIR="/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory found at $MIGRATIONS_DIR — skipping."
  exit 0
fi

for f in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  echo "Running migration: $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "All migrations complete."
