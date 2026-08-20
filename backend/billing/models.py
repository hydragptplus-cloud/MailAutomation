import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class Plan(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=40)
    original_price_bdt = models.PositiveIntegerField(default=0)
    discount_percent = models.PositiveIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    price_bdt = models.PositiveIntegerField(default=0)
    email_limit = models.PositiveIntegerField()
    daily_email_limit = models.PositiveIntegerField(default=0)
    weekly_email_limit = models.PositiveIntegerField(default=0)
    max_admins = models.PositiveIntegerField()
    max_users = models.PositiveIntegerField()
    max_smtp_accounts = models.PositiveIntegerField()
    max_recipients = models.PositiveIntegerField(default=10000)
    max_campaigns_per_day = models.PositiveIntegerField(default=10)
    is_free = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("display_order", "price_bdt")

    def __str__(self):
        return self.name

    def calculate_payable_price(self) -> int:
        if self.is_free or self.original_price_bdt == 0:
            return 0
        discount = Decimal(self.discount_percent or 0)
        original = Decimal(self.original_price_bdt)
        payable = (original * (Decimal(100) - discount) / Decimal(100)).quantize(Decimal("1"))
        return int(payable)

    def save(self, *args, **kwargs):
        if self.is_free:
            self.original_price_bdt = 0
            self.discount_percent = 0
            self.price_bdt = 0
        else:
            self.price_bdt = self.calculate_payable_price()
        super().save(*args, **kwargs)


class Subscription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"
        SUSPENDED = "suspended", "Suspended"

    organization = models.OneToOneField("common.Organization", on_delete=models.CASCADE, related_name="subscription")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    activated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organization} - {self.plan}"


class PaymentInvoice(models.Model):
    class Network(models.TextChoices):
        BSC = "bsc", "BNB Smart Chain"
        ETHEREUM = "ethereum", "Ethereum"
        TRON = "tron", "Tron"
        TON = "ton", "TON"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFYING = "verifying", "Verifying"
        PAID = "paid", "Paid"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"
        REPLACED = "replaced", "Replaced"
        MANUAL_REVIEW = "manual_review", "Manual review"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="invoices")
    organization = models.ForeignKey("common.Organization", null=True, blank=True, on_delete=models.PROTECT, related_name="payment_invoices")
    customer_name = models.CharField(max_length=150)
    customer_email = models.EmailField()
    organization_name = models.CharField(max_length=255)
    password_hash = models.CharField(max_length=255, blank=True)
    access_token_digest = models.CharField(max_length=64, blank=True, db_index=True)
    encrypted_access_token = models.TextField(blank=True)
    access_token_created_at = models.DateTimeField(null=True, blank=True)
    access_token_last_used_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=96, blank=True, db_index=True)
    normalized_customer_email = models.EmailField(blank=True, db_index=True)
    normalized_organization_name = models.CharField(max_length=255, blank=True, db_index=True)
    network = models.CharField(max_length=16, choices=Network.choices)
    receiving_address = models.CharField(max_length=128)
    token_contract = models.CharField(max_length=128)
    price_bdt = models.PositiveIntegerField()
    usdt_bdt_rate = models.DecimalField(max_digits=12, decimal_places=4)
    amount_usdt = models.DecimalField(max_digits=20, decimal_places=6)
    token_decimals = models.PositiveSmallIntegerField(default=6)
    amount_raw = models.DecimalField(max_digits=48, decimal_places=0, default=Decimal("0"))
    snapshot_limits = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    transaction_hash = models.CharField(max_length=128, null=True, blank=True)
    transfer_index = models.PositiveIntegerField(default=0)
    verification_error = models.TextField(blank=True)
    verification_data = models.JSONField(default=dict, blank=True)
    replaced_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replaces")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    replaced_at = models.DateTimeField(null=True, blank=True)
    invoice_email_sent_at = models.DateTimeField(null=True, blank=True)
    invoice_email_error = models.TextField(blank=True)
    recovery_email_sent_at = models.DateTimeField(null=True, blank=True)
    recovery_email_error = models.TextField(blank=True)
    confirmation_email_sent_at = models.DateTimeField(null=True, blank=True)
    confirmation_email_error = models.TextField(blank=True)
    manual_review_email_sent_at = models.DateTimeField(null=True, blank=True)
    manual_review_email_error = models.TextField(blank=True)
    expires_at = models.DateTimeField()
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("network", "transaction_hash", "transfer_index"),
                condition=models.Q(transaction_hash__isnull=False),
                name="unique_consumed_chain_transfer",
            ),
            models.UniqueConstraint(
                fields=("normalized_customer_email",),
                condition=Q(status__in=("pending", "verifying")),
                name="unique_active_invoice_per_normalized_email",
            ),
            models.UniqueConstraint(
                fields=("normalized_organization_name",),
                condition=Q(status__in=("pending", "verifying")),
                name="unique_active_invoice_per_normalized_org",
            ),
            models.UniqueConstraint(
                fields=("normalized_customer_email", "idempotency_key"),
                condition=~Q(idempotency_key=""),
                name="unique_checkout_idempotency_per_email",
            ),
        ]


class CheckoutSession(models.Model):
    invoice = models.ForeignKey(PaymentInvoice, on_delete=models.CASCADE, related_name="checkout_sessions")
    token_digest = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)


class InvoiceAccessCode(models.Model):
    invoice = models.ForeignKey(PaymentInvoice, on_delete=models.CASCADE, related_name="access_codes")
    code_digest = models.CharField(max_length=64, unique=True, db_index=True)
    encrypted_delivery_copy = models.TextField(blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class CheckoutEmailVerification(models.Model):
    normalized_email = models.EmailField(db_index=True)
    email = models.EmailField()
    code_digest = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class PreCheckoutSession(models.Model):
    normalized_email = models.EmailField(db_index=True)
    token_digest = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class PaymentTransferLedger(models.Model):
    class Resolution(models.TextChoices):
        UNRESOLVED = "unresolved", "Unresolved"
        AUTO_ACTIVATED = "auto_activated", "Auto activated"
        MANUAL_APPROVED = "manual_approved", "Manual approved"
        MANUAL_REJECTED = "manual_rejected", "Manual rejected"
        MANUAL_REFUNDED = "manual_refunded", "Manual refunded"

    network = models.CharField(max_length=16, choices=PaymentInvoice.Network.choices)
    transaction_hash = models.CharField(max_length=128)
    transfer_index = models.PositiveIntegerField(default=0)
    canonical_contract = models.CharField(max_length=128)
    destination = models.CharField(max_length=128)
    amount_raw = models.DecimalField(max_digits=48, decimal_places=0)
    amount_usdt = models.DecimalField(max_digits=20, decimal_places=6)
    block_reference = models.CharField(max_length=128, blank=True)
    confirmations = models.PositiveIntegerField(null=True, blank=True)
    occurred_at = models.DateTimeField()
    provider_proofs = models.JSONField(default=dict, blank=True)
    invoice = models.ForeignKey(PaymentInvoice, null=True, blank=True, on_delete=models.PROTECT, related_name="transfer_ledgers")
    resolution = models.CharField(max_length=24, choices=Resolution.choices, default=Resolution.UNRESOLVED)
    resolution_history = models.JSONField(default=list, blank=True)
    refund_transaction_hash = models.CharField(max_length=128, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("network", "transaction_hash", "transfer_index"),
                name="unique_transfer_ledger_entry",
            )
        ]


class PaymentSecurityAuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    invoice = models.ForeignKey(PaymentInvoice, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events")
    ledger = models.ForeignKey(PaymentTransferLedger, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events")
    event_type = models.CharField(max_length=64)
    metadata = models.JSONField(default=dict, blank=True)
    ip_hash = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class FreePlanClaim(models.Model):
    ip_hash = models.CharField(max_length=64, unique=True)
    email_hash = models.CharField(max_length=64, unique=True)
    organization = models.OneToOneField("common.Organization", on_delete=models.CASCADE, related_name="free_plan_claim")
    created_at = models.DateTimeField(auto_now_add=True)
