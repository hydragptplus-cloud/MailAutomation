from django.conf import settings
from django.db import models
from cryptography.fernet import Fernet, InvalidToken

class SMTPAccount(models.Model):
    objects = models.Manager()
    organization = models.ForeignKey("common.Organization", on_delete=models.CASCADE, related_name="smtp_accounts", null=True)

    class Encryption(models.TextChoices):
        NONE = "none", "None"
        TLS = "tls", "STARTTLS"
        SSL = "ssl", "SSL/TLS"

    name = models.CharField(max_length=255)
    host = models.CharField(max_length=255)
    port = models.PositiveIntegerField(default=587)
    username = models.CharField(max_length=255)
    encrypted_password = models.TextField()
    encryption = models.CharField(max_length=10, choices=Encryption.choices, default=Encryption.TLS)
    from_name = models.CharField(max_length=255, blank=True)
    from_email = models.EmailField()
    reply_to = models.EmailField(blank=True, default="")
    daily_limit = models.PositiveIntegerField(default=1000)
    sent_today = models.PositiveIntegerField(default=0)
    sent_date = models.DateField(null=True, blank=True)
    status = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _fernet(self):
        key = getattr(settings, "FIELD_ENCRYPTION_KEY", None)
        if not key:
            raise ValueError("FIELD_ENCRYPTION_KEY is not configured in environment settings.")
        if isinstance(key, str):
            key = key.encode()
        return Fernet(key)

    def set_password(self, raw_password):
        self.encrypted_password = str(self._fernet().encrypt(raw_password.encode()).decode())

    def get_password(self):
        try:
            enc_pw = str(self.encrypted_password or "")
            return self._fernet().decrypt(enc_pw.encode()).decode()
        except InvalidToken:
            return ""

    def __str__(self) -> str:
        return str(self.name)
