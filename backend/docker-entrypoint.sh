#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    python manage.py migrate
fi

exec "$@"
