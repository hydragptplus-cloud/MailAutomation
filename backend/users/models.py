from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        OPERATOR = "operator", "Operator"
        VIEWER = "viewer", "Viewer"

    name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OPERATOR)
    organization = models.ForeignKey(
        "common.Organization",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )

    def save(self, *args, **kwargs):
        if self.name and not self.first_name:
            self.first_name = self.name
        super().save(*args, **kwargs)


class UserLoginSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_sessions")
    session_id = models.UUIDField(unique=True, editable=False)
    refresh_token_jti = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
