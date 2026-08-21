from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from .models import BillingConfiguration, Organization, OrganizationUsage
from .plan_features import organization_has_support_workspace_plan, organization_mailbox_usage
from .quotas import usage_snapshot


class OrganizationSerializer(serializers.ModelSerializer):
    plan_slug = serializers.SlugField(write_only=True, required=False)
    user_count = serializers.SerializerMethodField()
    admin_count = serializers.SerializerMethodField()
    smtp_count = serializers.IntegerField(source="smtp_accounts.count", read_only=True)
    recipient_count = serializers.IntegerField(source="recipients.count", read_only=True)
    mailbox_count = serializers.SerializerMethodField()
    mail_connection_count = serializers.SerializerMethodField()
    support_workspace_available = serializers.SerializerMethodField()
    usage = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = "__all__"
        read_only_fields = (
            "created_by", "created_at", "updated_at", "max_users", "max_admins",
            "max_smtp_accounts", "max_recipients", "daily_email_limit", "weekly_email_limit",
            "monthly_email_limit", "max_campaigns_per_day",
        )

    def validate_plan_slug(self, value):
        from billing.models import Plan

        if not Plan.objects.filter(slug=value, is_active=True).exists():
            raise serializers.ValidationError("Choose an active pricing plan.")
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get("plan_slug"):
            raise serializers.ValidationError({"plan_slug": "Select a pricing plan."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from billing.models import Plan
        from billing.services import assign_plan_to_organization

        plan = Plan.objects.get(slug=validated_data.pop("plan_slug"), is_active=True)
        organization = super().create(validated_data)
        assign_plan_to_organization(organization, plan, activate_organization=True)
        return organization

    @transaction.atomic
    def update(self, instance, validated_data):
        from billing.models import Plan
        from billing.services import assign_plan_to_organization

        plan_slug = validated_data.pop("plan_slug", None)
        organization = super().update(instance, validated_data)
        if not plan_slug:
            return organization
        plan = Plan.objects.get(slug=plan_slug, is_active=True)
        assign_plan_to_organization(organization, plan)
        return organization

    def get_usage(self, obj):
        return usage_snapshot(obj)

    def get_user_count(self, obj):
        return obj.users.exclude(role__in=("owner", "admin")).count()

    def get_admin_count(self, obj):
        return obj.users.filter(role="admin").count()

    def get_mailbox_count(self, obj):
        return organization_mailbox_usage(obj)["inbox_count"]

    def get_mail_connection_count(self, obj):
        return organization_mailbox_usage(obj)["used"]

    def get_support_workspace_available(self, obj):
        return organization_has_support_workspace_plan(obj)

    def get_subscription(self, obj):
        try:
            subscription = obj.subscription
        except ObjectDoesNotExist:
            return None
        return {
            "plan": subscription.plan.slug,
            "plan_name": subscription.plan.name,
            "status": subscription.status,
            "current_period_start": subscription.current_period_start,
            "current_period_end": subscription.current_period_end,
        }


class OrganizationUsageSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = OrganizationUsage
        fields = "__all__"
        read_only_fields = fields


class BillingConfigurationSerializer(serializers.ModelSerializer):
    tron_api_key = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    toncenter_api_key = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    clear_tron_api_key = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_toncenter_api_key = serializers.BooleanField(write_only=True, required=False, default=False)
    tron_api_key_configured = serializers.SerializerMethodField()
    toncenter_api_key_configured = serializers.SerializerMethodField()
    updated_by_email = serializers.EmailField(source="updated_by.email", read_only=True, allow_null=True)

    class Meta:
        model = BillingConfiguration
        fields = (
            "usdt_bdt_rate", "payment_evm_wallet", "payment_tron_wallet", "payment_ton_wallet",
            "tron_api_key", "toncenter_api_key", "clear_tron_api_key", "clear_toncenter_api_key",
            "tron_api_key_configured", "toncenter_api_key_configured", "public_landing_monitor_active",
            "updated_by_email", "updated_at",
        )
        read_only_fields = ("tron_api_key_configured", "toncenter_api_key_configured", "updated_by_email", "updated_at")

    def get_tron_api_key_configured(self, obj):
        return bool(obj.encrypted_tron_api_key)

    def get_toncenter_api_key_configured(self, obj):
        return bool(obj.encrypted_toncenter_api_key)

    def validate_usdt_bdt_rate(self, value):
        if value <= 0:
            raise serializers.ValidationError("The USDT/BDT rate must be greater than zero.")
        return value

    def update(self, instance, validated_data):
        from billing.configuration import encrypt_billing_secret

        tron_key = validated_data.pop("tron_api_key", None)
        toncenter_key = validated_data.pop("toncenter_api_key", None)
        clear_tron = validated_data.pop("clear_tron_api_key", False)
        clear_toncenter = validated_data.pop("clear_toncenter_api_key", False)
        if clear_tron:
            instance.encrypted_tron_api_key = ""
        elif tron_key:
            instance.encrypted_tron_api_key = encrypt_billing_secret(tron_key)
        if clear_toncenter:
            instance.encrypted_toncenter_api_key = ""
        elif toncenter_key:
            instance.encrypted_toncenter_api_key = encrypt_billing_secret(toncenter_key)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance
