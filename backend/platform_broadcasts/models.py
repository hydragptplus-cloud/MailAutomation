from django.conf import settings
from django.db import models
from django.db.models import Q


class PlatformBroadcast(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        QUEUED = "queued", "Queued"
        SENDING = "sending", "Sending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    subject = models.CharField(max_length=255)
    body = models.TextField()
    target_roles = models.JSONField(default=list, blank=True)
    target_plan_slugs = models.JSONField(default=list, blank=True)
    target_organization_statuses = models.JSONField(default=list, blank=True)
    active_only = models.BooleanField(default=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_broadcasts_created",
    )
    total_count = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    queued_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.subject


class PlatformBroadcastDelivery(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    broadcast = models.ForeignKey(PlatformBroadcast, on_delete=models.CASCADE, related_name="deliveries")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_broadcast_deliveries",
    )
    recipient_email = models.EmailField()
    recipient_name = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    message = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("broadcast", "status"))]
        constraints = [
            models.UniqueConstraint(
                fields=("broadcast", "user"),
                condition=Q(user__isnull=False),
                name="unique_platform_broadcast_user_delivery",
            )
        ]
