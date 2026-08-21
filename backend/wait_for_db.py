import os
import time

import django
from django.db import OperationalError, connections


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

max_attempts = int(os.getenv("DB_WAIT_MAX_ATTEMPTS", "30"))
retry_delay = float(os.getenv("DB_WAIT_RETRY_DELAY", "2"))
database = connections["default"]

for attempt in range(1, max_attempts + 1):
    try:
        database.ensure_connection()
        print("Database is ready.", flush=True)
        break
    except OperationalError:
        database.close()
        if attempt == max_attempts:
            print("Database did not become ready before the startup timeout.", flush=True)
            raise
        print(
            f"Database is not ready; retrying in {retry_delay:g}s "
            f"({attempt}/{max_attempts}).",
            flush=True,
        )
        time.sleep(retry_delay)

database.close()
