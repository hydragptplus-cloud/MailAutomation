import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = "Create or rotate the platform owner account as an explicit one-time operation."

    def add_arguments(self, parser):
        parser.add_argument("--username", default=os.getenv("DJANGO_SUPERUSER_USERNAME", "admin"))
        parser.add_argument("--email", default=os.getenv("DJANGO_SUPERUSER_EMAIL", "admin@example.com"))
        parser.add_argument("--password-env", default="DJANGO_SUPERUSER_PASSWORD")

    def handle(self, *args, **options):
        password = os.getenv(options["password_env"])
        if not password:
            raise CommandError(f"{options['password_env']} must be set for owner bootstrap.")
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=options["username"],
            defaults={"email": options["email"], "role": User.Role.OWNER, "is_staff": True, "is_superuser": True},
        )
        user.email = options["email"]
        user.role = User.Role.OWNER
        user.organization = None
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()
        action = "created" if created else "rotated"
        self.stdout.write(self.style.SUCCESS(
            f"Owner account {action}: username={user.username} email={user.email} at={timezone.now().isoformat()}"
        ))
