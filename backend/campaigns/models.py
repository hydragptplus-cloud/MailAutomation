from django.conf import settings
from django.db import models


class Campaign(models.Model):
    objects = models.Manager()
    organization = models.ForeignKey("common.Organization", on_delete=models.CASCADE, related_name="campaigns", null=True)

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=255, blank=True)
    template = models.ForeignKey("templates_app.EmailTemplate", on_delete=models.SET_NULL, null=True, blank=True, related_name="campaigns")
    recipient_list = models.ForeignKey("recipients.RecipientList", on_delete=models.SET_NULL, null=True, blank=True, related_name="campaigns")
    smtp = models.ForeignKey("smtp_manager.SMTPAccount", on_delete=models.SET_NULL, null=True, blank=True, related_name="campaigns")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="campaigns")
    created_at = models.DateTimeField(auto_now_add=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    total_count = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name

class CampaignLog(models.Model):
    objects = models.Manager()
    organization = models.ForeignKey("common.Organization", on_delete=models.CASCADE, related_name="campaign_logs", null=True)

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="logs")
    recipient = models.ForeignKey("recipients.Recipient", on_delete=models.SET_NULL, null=True, related_name="campaign_logs")
    recipient_email = models.EmailField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    message = models.TextField(blank=True)
    provider_message_id = models.CharField(max_length=255, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["campaign", "recipient_email"], name="unique_campaign_recipient_email")]
        indexes = [models.Index(fields=["campaign", "status"])]
