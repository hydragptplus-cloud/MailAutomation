from django.conf import settings
from django.db import models
from django.db.models import Q


class Notification(models.Model):
    class Type(models.TextChoices):
        BROADCAST = "broadcast", "Broadcast"
        BILLING = "billing", "Billing"
        SUPPORT = "support", "Support"
        SYSTEM = "system", "System"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.SYSTEM)
    title = models.CharField(max_length=255)
    body = models.TextField()
    related_broadcast = models.ForeignKey(
        "platform_broadcasts.PlatformBroadcast",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("user", "read_at")),
            models.Index(fields=("user", "type", "created_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("user", "related_broadcast"),
                condition=Q(related_broadcast__isnull=False),
                name="unique_user_broadcast_notification",
            )
        ]

    def __str__(self):
        return f"{self.user_id}: {self.title}"
