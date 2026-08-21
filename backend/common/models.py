from django.conf import settings
from django.db import models
from decimal import Decimal


class Organization(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        EXPIRED = "expired", "Expired"

    name = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    max_users = models.PositiveIntegerField(default=5)
    max_admins = models.PositiveIntegerField(default=1)
    max_smtp_accounts = models.PositiveIntegerField(default=2)
    max_recipients = models.PositiveIntegerField(default=10000)
    support_workspace_enabled = models.BooleanField(default=False)
    daily_email_limit = models.PositiveIntegerField(default=1000, help_text="Zero means no daily limit.")
    monthly_email_limit = models.PositiveIntegerField(default=30000)
    weekly_email_limit = models.PositiveIntegerField(default=0, help_text="Zero means no weekly limit.")
    max_campaigns_per_day = models.PositiveIntegerField(default=10)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class OrganizationUsage(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="usage_records")
    date = models.DateField()
    emails_sent = models.PositiveIntegerField(default=0)
    emails_failed = models.PositiveIntegerField(default=0)
    campaigns_launched = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "date"], name="unique_organization_usage_date")
        ]

class SystemSetting(models.Model):
    objects = models.Manager()
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="settings",
        null=True,
        blank=True,
    )

    # General
    app_name = models.CharField(max_length=255, default="Mail Flow")
    company_name = models.CharField(max_length=255, default="Acme Enterprises Inc.")
    default_sender_name = models.CharField(max_length=255, default="Marketing Team")
    default_sender_email = models.EmailField(default="marketing@acme.com")
    default_reply_to = models.EmailField(default="support@acme.com")
    default_timezone = models.CharField(max_length=100, default="UTC")
    date_format = models.CharField(max_length=50, default="YYYY-MM-DD")
    default_page_size = models.PositiveIntegerField(default=10)

    # Email Engine
    default_smtp = models.CharField(max_length=255, blank=True, default="")
    retry_count = models.PositiveIntegerField(default=3)
    retry_delay_seconds = models.PositiveIntegerField(default=300)
    batch_size = models.PositiveIntegerField(default=50)
    delay_between_emails = models.PositiveIntegerField(default=1)
    tracking_enabled = models.BooleanField(default=True)
    open_tracking = models.BooleanField(default=True)
    click_tracking = models.BooleanField(default=True)
    plaintext_fallback = models.BooleanField(default=True)
    unsubscribe_footer = models.TextField(default="You are receiving this email because you opted into our newsletter. Click here to unsubscribe.")

    # Storage
    max_upload_size_mb = models.PositiveIntegerField(default=25)
    allowed_image_formats = models.CharField(max_length=255, default="jpg, png, gif, webp")
    allowed_attachment_formats = models.CharField(max_length=255, default="pdf, docx, xlsx, zip")
    media_storage_path = models.CharField(max_length=255, default="/var/mail_automation/media/")
    file_retention_days = models.PositiveIntegerField(default=90)

    # Security
    session_timeout_minutes = models.PositiveIntegerField(default=60)
    password_min_length = models.PositiveIntegerField(default=8)
    login_attempt_limit = models.PositiveIntegerField(default=5)
    two_factor_enabled = models.BooleanField(default=False)
    audit_log_retention_days = models.PositiveIntegerField(default=365)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System Setting"
        verbose_name_plural = "System Settings"

    def __str__(self) -> str:
        return f"System Setting ({self.app_name})"


class BillingConfiguration(models.Model):
    """Singleton platform billing configuration. API credentials are encrypted separately."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    usdt_bdt_rate = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("122.0000"))
    payment_evm_wallet = models.CharField(max_length=128)
    payment_tron_wallet = models.CharField(max_length=128)
    payment_ton_wallet = models.CharField(max_length=128)
    encrypted_tron_api_key = models.TextField(blank=True)
    encrypted_toncenter_api_key = models.TextField(blank=True)
    public_landing_monitor_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="billing_configuration_updates",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        return super().save(*args, **kwargs)

    def __str__(self):
        return "Platform billing configuration"
