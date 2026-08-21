#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    python /app/wait_for_db.py
    python manage.py migrate
fi

exec "$@"
