from django.conf import settings
from django.db import models

class EmailTemplate(models.Model):
    objects = models.Manager()
    organization = models.ForeignKey("common.Organization", on_delete=models.CASCADE, related_name="email_templates", null=True)

    title = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    html = models.TextField()
    json_layout = models.JSONField(default=dict, blank=True)
    thumbnail = models.ImageField(upload_to="template_thumbnails/", blank=True, null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="email_templates")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return str(self.title)
