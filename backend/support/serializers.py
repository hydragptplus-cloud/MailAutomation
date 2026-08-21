from django.db import transaction
from rest_framework import serializers

from common.plan_features import (
    organization_has_support_workspace_plan,
    organization_mailbox_usage,
    organization_support_workspace_allowed,
)
from common.tenancy import request_organization
from .models import SupportMailbox, SupportMessage, SupportTicket
from .services import create_support_ticket


class SupportMessageSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True, allow_null=True)

    class Meta:
        model = SupportMessage
        fields = (
            "id", "direction", "sender_name", "sender_email", "recipient_email",
            "subject", "body", "created_by_name", "created_at",
        )
        read_only_fields = fields


class SupportTicketSerializer(serializers.ModelSerializer):
    messages = SupportMessageSerializer(many=True, read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True, allow_null=True)
    mailbox_email = serializers.EmailField(source="mailbox.email", read_only=True, allow_null=True)

    class Meta:
        model = SupportTicket
        fields = (
            "id", "ticket_number", "organization", "organization_name", "mailbox",
            "mailbox_email", "requester", "name", "email", "subject", "status",
            "priority", "source", "assigned_to", "last_message_at", "created_at",
            "updated_at", "messages",
        )
        read_only_fields = (
            "ticket_number", "requester", "source", "last_message_at",
            "created_at", "updated_at", "messages",
        )


class PublicSupportTicketSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    subject = serializers.CharField(max_length=180)
    message = serializers.CharField(max_length=10000)

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        requester = user if getattr(user, "is_authenticated", False) else None
        organization = getattr(requester, "organization", None) if requester else None
        return create_support_ticket(
            name=validated_data["name"],
            email_address=validated_data["email"],
            subject=validated_data["subject"],
            body=validated_data["message"],
            organization=organization,
            requester=requester,
            source="authenticated" if requester else "public",
        )


class SupportReplySerializer(serializers.Serializer):
    body = serializers.CharField(max_length=20000)
    mailbox = serializers.PrimaryKeyRelatedField(queryset=SupportMailbox.objects.all(), required=False, allow_null=True)


class SupportMailboxSerializer(serializers.ModelSerializer):
    imap_password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    smtp_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True, allow_null=True)
    password_configured = serializers.SerializerMethodField()

    class Meta:
        model = SupportMailbox
        fields = (
            "id", "organization", "organization_name", "name", "email",
            "imap_host", "imap_port", "imap_encryption", "imap_username", "imap_password",
            "smtp_host", "smtp_port", "smtp_encryption", "smtp_username", "smtp_password",
            "from_name", "is_active", "last_synced_at", "last_error",
            "password_configured", "created_at", "updated_at",
        )
        read_only_fields = ("last_synced_at", "last_error", "password_configured", "created_at", "updated_at")

    def get_password_configured(self, obj):
        return bool(obj.encrypted_imap_password)

    def validate(self, attrs):
        request = self.context["request"]
        user = request.user
        if user.role != "owner":
            organization = getattr(user, "organization", None)
            if not organization_support_workspace_allowed(organization):
                raise serializers.ValidationError({"detail": "Mail workspace is available only on Premium+ and Custom plans."})
            attrs["organization"] = organization
        elif not attrs.get("organization") and self.instance is None:
            attrs["organization"] = request_organization(request, required=False)
        if self.instance is None and not attrs.get("imap_password"):
            raise serializers.ValidationError({"imap_password": "Password is required."})
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        if organization and not organization_has_support_workspace_plan(organization):
            raise serializers.ValidationError({"detail": "Mail workspace is available only on Premium+ and Custom plans."})
        if self.instance is None and organization:
            usage = organization_mailbox_usage(organization)
            if usage["used"] >= usage["limit"]:
                raise serializers.ValidationError({
                    "detail": "Mail connection limit reached for this account.",
                    "limit": usage["limit"],
                    "used": usage["used"],
                })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        imap_password = validated_data.pop("imap_password")
        smtp_password = validated_data.pop("smtp_password", "")
        organization = validated_data.get("organization")
        if organization:
            organization = type(organization).objects.select_for_update().get(pk=organization.pk)
            usage = organization_mailbox_usage(organization)
            if usage["used"] >= usage["limit"]:
                raise serializers.ValidationError({
                    "detail": "Mail connection limit reached for this account.",
                    "limit": usage["limit"],
                    "used": usage["used"],
                })
            validated_data["organization"] = organization
        mailbox = SupportMailbox(**validated_data)
        mailbox.set_imap_password(imap_password)
        if smtp_password:
            mailbox.set_smtp_password(smtp_password)
        mailbox.created_by = self.context["request"].user
        mailbox.save()
        return mailbox

    def update(self, instance, validated_data):
        imap_password = validated_data.pop("imap_password", None)
        smtp_password = validated_data.pop("smtp_password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if imap_password:
            instance.set_imap_password(imap_password)
        if smtp_password:
            instance.set_smtp_password(smtp_password)
        instance.save()
        return instance
