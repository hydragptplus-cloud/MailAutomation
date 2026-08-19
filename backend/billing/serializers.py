from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from rest_framework import serializers
from django.db import transaction

from common.models import Organization
from .models import PaymentInvoice, PaymentTransferLedger, Plan

User = get_user_model()


def validate_network_enabled(value):
    flag = {
        "bsc": "PAYMENT_NETWORK_BSC_ENABLED",
        "ethereum": "PAYMENT_NETWORK_ETHEREUM_ENABLED",
        "tron": "PAYMENT_NETWORK_TRON_ENABLED",
        "ton": "PAYMENT_NETWORK_TON_ENABLED",
    }[value]
    if not getattr(settings, flag, False):
        raise serializers.ValidationError("This payment network is not enabled yet.")
    return value


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = (
            "slug", "name", "price_bdt", "email_limit", "daily_email_limit",
            "weekly_email_limit", "max_admins", "max_users", "max_smtp_accounts", "is_free",
            "max_recipients", "max_campaigns_per_day",
        )


class PlanAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = (
            "id", "slug", "name", "price_bdt", "email_limit", "daily_email_limit",
            "weekly_email_limit", "max_admins", "max_users", "max_smtp_accounts",
            "max_recipients", "max_campaigns_per_day", "is_free", "is_active", "display_order",
        )
        read_only_fields = ("id",)

    def validate(self, attrs):
        is_free = attrs.get("is_free", getattr(self.instance, "is_free", False))
        price = attrs.get("price_bdt", getattr(self.instance, "price_bdt", 0))
        if is_free and price != 0:
            raise serializers.ValidationError({"price_bdt": "A free plan must have a zero price."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        from .services import apply_plan_to_organization

        for subscription in instance.subscriptions.select_related("organization"):
            apply_plan_to_organization(subscription.organization, instance, activate=False)
        return instance


class RegistrationFieldsSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    organization_name = serializers.CharField(max_length=255)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account already exists with this email.")
        return value.strip().lower()

    def validate_organization_name(self, value):
        value = value.strip()
        if Organization.objects.filter(name__iexact=value).exists():
            raise serializers.ValidationError("An organization with this name already exists.")
        return value

    def validate(self, attrs):
        candidate = User(email=attrs.get("email", ""), name=attrs.get("name", ""))
        validate_password(attrs["password"], user=candidate)
        attrs["password_hash"] = make_password(attrs.pop("password"))
        return attrs


class FreeSignupSerializer(RegistrationFieldsSerializer):
    pass


class InvoiceCreateSerializer(RegistrationFieldsSerializer):
    plan_slug = serializers.SlugField()
    network = serializers.ChoiceField(choices=PaymentInvoice.Network.choices)
    idempotency_key = serializers.CharField(max_length=96, required=False, allow_blank=True)

    def validate_plan_slug(self, value):
        if not Plan.objects.filter(slug=value, is_active=True, is_free=False).exists():
            raise serializers.ValidationError("Choose an active paid plan.")
        return value

    def validate_network(self, value):
        return validate_network_enabled(value)

    def create(self, validated_data):
        from .services import create_invoice

        return create_invoice({
            "plan_slug": validated_data["plan_slug"],
            "network": validated_data["network"],
            "customer_name": validated_data["name"],
            "customer_email": validated_data["email"],
            "organization_name": validated_data["organization_name"],
            "password_hash": validated_data["password_hash"],
            "idempotency_key": validated_data.get("idempotency_key", ""),
        })


class AccountInvoiceCreateSerializer(serializers.Serializer):
    plan_slug = serializers.SlugField()
    network = serializers.ChoiceField(choices=PaymentInvoice.Network.choices)
    idempotency_key = serializers.CharField(max_length=96, required=False, allow_blank=True)

    def validate_plan_slug(self, value):
        if not Plan.objects.filter(slug=value, is_active=True, is_free=False).exists():
            raise serializers.ValidationError("Choose an active paid plan.")
        return value

    def validate_network(self, value):
        return validate_network_enabled(value)

    def create(self, validated_data):
        from .services import create_invoice

        request = self.context["request"]
        user = request.user
        return create_invoice({
            "plan_slug": validated_data["plan_slug"],
            "network": validated_data["network"],
            "organization": user.organization,
            "customer_name": user.name or user.get_full_name() or user.username,
            "customer_email": user.email,
            "organization_name": user.organization.name,
            "password_hash": "",
            "idempotency_key": validated_data.get("idempotency_key", ""),
        })


class InvoiceSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)
    explorer_url = serializers.SerializerMethodField()
    replaced_by = serializers.UUIDField(source="replaced_by_id", read_only=True)

    class Meta:
        model = PaymentInvoice
        fields = (
            "id", "plan", "network", "receiving_address", "token_contract", "price_bdt",
            "usdt_bdt_rate", "amount_usdt", "status", "transaction_hash", "verification_error",
            "expires_at", "verified_at", "created_at", "explorer_url", "replaced_by",
            "invoice_email_sent_at", "invoice_email_error", "recovery_email_sent_at",
            "recovery_email_error", "confirmation_email_sent_at", "confirmation_email_error",
            "manual_review_email_sent_at", "manual_review_email_error",
        )
        read_only_fields = fields

    def get_explorer_url(self, obj):
        if not obj.transaction_hash:
            return None
        bases = {
            "bsc": "https://bscscan.com/tx/",
            "ethereum": "https://etherscan.io/tx/",
            "tron": "https://tronscan.org/#/transaction/",
            "ton": "https://tonviewer.com/transaction/",
        }
        return f"{bases[obj.network]}{obj.transaction_hash}"


class TransactionSubmissionSerializer(serializers.Serializer):
    transaction = serializers.CharField(max_length=500)


class CheckoutEmailStartSerializer(serializers.Serializer):
    email = serializers.EmailField()
    turnstile_token = serializers.CharField(required=False, allow_blank=True, max_length=4096)

    def validate_email(self, value):
        return value.strip().lower()


class CheckoutEmailVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_email(self, value):
        return value.strip().lower()


class InvoiceRecoverSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class InvoiceReplaceSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        invoice = self.context["invoice"]
        candidate = User(email=invoice.customer_email, name=invoice.customer_name)
        validate_password(attrs["password"], user=candidate)
        attrs["password_hash"] = make_password(attrs.pop("password"))
        return attrs


class PaymentTransferLedgerSerializer(serializers.ModelSerializer):
    invoice_id = serializers.UUIDField(source="invoice.id", read_only=True)
    customer_email = serializers.EmailField(source="invoice.customer_email", read_only=True)
    plan_name = serializers.CharField(source="invoice.plan.name", read_only=True)

    class Meta:
        model = PaymentTransferLedger
        fields = (
            "id", "network", "transaction_hash", "transfer_index", "canonical_contract",
            "destination", "amount_raw", "amount_usdt", "block_reference", "confirmations",
            "invoice_id", "customer_email", "plan_name", "resolution", "refund_transaction_hash",
            "notes", "created_at", "updated_at",
        )
        read_only_fields = fields


class ManualReviewActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=("approve", "reject", "refund"))
    notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    refund_transaction_hash = serializers.CharField(required=False, allow_blank=True, max_length=128)
