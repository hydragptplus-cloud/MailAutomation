import os

import django
from django.core.management import call_command


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

call_command("collectstatic", interactive=False, verbosity=1)
call_command("migrate", interactive=False, verbosity=1)

port = os.getenv("PORT", "8000")
os.execvp(
    "gunicorn",
    [
        "gunicorn",
        "config.wsgi:application",
        "--bind",
        f"0.0.0.0:{port}",
        "--workers",
        "3",
    ],
)
