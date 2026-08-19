from django.conf import settings
from django.db import models

class RecipientList(models.Model):
    objects = models.Manager()
    organization = models.ForeignKey("common.Organization", on_delete=models.CASCADE, related_name="recipient_lists", null=True)

    list_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        # pyrefly: ignore [unnecessary-type-conversion]
        return str(self.list_name)

class Recipient(models.Model):
    objects = models.Manager()
    organization = models.ForeignKey("common.Organization", on_delete=models.CASCADE, related_name="recipients", null=True)

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        UNSUBSCRIBED = "unsubscribed", "Unsubscribed"
        BOUNCED = "bounced", "Bounced"
        INVALID = "invalid", "Invalid"

    recipient_list = models.ForeignKey(RecipientList, on_delete=models.CASCADE, related_name="recipients")
    name = models.CharField(max_length=255, blank=True)
    email = models.EmailField()
    company = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    website = models.URLField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    tags = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    consented_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["recipient_list", "email"], name="unique_recipient_per_list")]
        indexes = [models.Index(fields=["email"]), models.Index(fields=["status"])]

    def __str__(self) -> str:
        return self.email
