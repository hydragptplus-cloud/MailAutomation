from base64 import urlsafe_b64encode
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet():
    key = getattr(settings, "FIELD_ENCRYPTION_KEY", None)
    if not key:
        key = urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


class SupportMailbox(models.Model):
    class Encryption(models.TextChoices):
        NONE = "none", "None"
        TLS = "tls", "STARTTLS"
        SSL = "ssl", "SSL/TLS"

    organization = models.ForeignKey(
        "common.Organization",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="support_mailboxes",
    )
    name = models.CharField(max_length=150)
    email = models.EmailField()
    imap_host = models.CharField(max_length=255)
    imap_port = models.PositiveIntegerField(default=993)
    imap_encryption = models.CharField(max_length=10, choices=Encryption.choices, default=Encryption.SSL)
    imap_username = models.CharField(max_length=255)
    encrypted_imap_password = models.TextField()
    smtp_host = models.CharField(max_length=255)
    smtp_port = models.PositiveIntegerField(default=465)
    smtp_encryption = models.CharField(max_length=10, choices=Encryption.choices, default=Encryption.SSL)
    smtp_username = models.CharField(max_length=255)
    encrypted_smtp_password = models.TextField(blank=True)
    from_name = models.CharField(max_length=150, blank=True, default="Mail Flow Support")
    is_active = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_mailboxes_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(fields=("organization", "email"), name="unique_support_mailbox_per_org_email"),
        ]

    def _set_secret(self, field, raw_password):
        setattr(self, field, _fernet().encrypt(raw_password.encode()).decode())

    def _get_secret(self, field):
        try:
            return _fernet().decrypt((getattr(self, field) or "").encode()).decode()
        except (InvalidToken, ValueError):
            return ""

    def set_imap_password(self, raw_password):
        self._set_secret("encrypted_imap_password", raw_password)

    def get_imap_password(self):
        return self._get_secret("encrypted_imap_password")

    def set_smtp_password(self, raw_password):
        self._set_secret("encrypted_smtp_password", raw_password)

    def get_smtp_password(self):
        return self._get_secret("encrypted_smtp_password") or self.get_imap_password()

    def __str__(self):
        return f"{self.name} <{self.email}>"


class SupportTicket(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "New"
        OPEN = "open", "Open"
        WAITING = "waiting", "Waiting"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    class Priority(models.TextChoices):
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    organization = models.ForeignKey(
        "common.Organization",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_tickets",
    )
    mailbox = models.ForeignKey(SupportMailbox, null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="support_tickets")
    ticket_number = models.CharField(max_length=24, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    email = models.EmailField()
    subject = models.CharField(max_length=180)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW)
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.NORMAL)
    source = models.CharField(max_length=32, default="public")
    external_message_id = models.CharField(max_length=255, blank=True, db_index=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_support_tickets")
    last_message_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-last_message_at", "-created_at")

    def __str__(self):
        return f"{self.ticket_number} - {self.subject}"


class SupportMessage(models.Model):
    class Direction(models.TextChoices):
        INBOUND = "inbound", "Inbound"
        OUTBOUND = "outbound", "Outbound"
        INTERNAL = "internal", "Internal"

    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name="messages")
    direction = models.CharField(max_length=16, choices=Direction.choices)
    sender_name = models.CharField(max_length=150, blank=True)
    sender_email = models.EmailField(blank=True)
    recipient_email = models.EmailField(blank=True)
    subject = models.CharField(max_length=180, blank=True)
    body = models.TextField()
    external_message_id = models.CharField(max_length=255, blank=True, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="support_messages_created")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
