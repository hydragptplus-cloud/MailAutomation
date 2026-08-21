from rest_framework import serializers

from .models import PlatformBroadcast, PlatformBroadcastDelivery
from .services import VALID_ORGANIZATION_STATUSES, VALID_ROLES, normalize_list, preview_count


class PlatformBroadcastDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformBroadcastDelivery
        fields = (
            "id", "recipient_email", "recipient_name", "status", "attempts",
            "message", "sent_at", "created_at", "updated_at",
        )
        read_only_fields = fields


class PlatformBroadcastSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, allow_null=True)
    preview_count = serializers.SerializerMethodField()

    class Meta:
        model = PlatformBroadcast
        fields = (
            "id", "subject", "body", "target_roles", "target_plan_slugs",
            "target_organization_statuses", "active_only", "status",
            "created_by", "created_by_email", "total_count", "sent_count",
            "failed_count", "skipped_count", "preview_count", "queued_at",
            "started_at", "finished_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "created_by", "created_by_email", "status", "total_count",
            "sent_count", "failed_count", "skipped_count", "preview_count",
            "queued_at", "started_at", "finished_at", "created_at", "updated_at",
        )

    def get_preview_count(self, obj):
        return preview_count({}, obj)

    def validate_target_roles(self, value):
        values = normalize_list(value)
        invalid = sorted(set(values) - VALID_ROLES)
        if invalid:
            raise serializers.ValidationError(f"Unsupported roles: {', '.join(invalid)}")
        return values

    def validate_target_organization_statuses(self, value):
        values = normalize_list(value)
        invalid = sorted(set(values) - VALID_ORGANIZATION_STATUSES)
        if invalid:
            raise serializers.ValidationError(f"Unsupported organization statuses: {', '.join(invalid)}")
        return values

    def validate_target_plan_slugs(self, value):
        return normalize_list(value)

    def validate(self, attrs):
        subject = attrs.get("subject", getattr(self.instance, "subject", ""))
        body = attrs.get("body", getattr(self.instance, "body", ""))
        if not subject.strip():
            raise serializers.ValidationError({"subject": "Subject is required."})
        if not body.strip():
            raise serializers.ValidationError({"body": "Message is required."})
        if self.instance and self.instance.status != PlatformBroadcast.Status.DRAFT:
            mutable = {"target_roles", "target_plan_slugs", "target_organization_statuses", "active_only", "subject", "body"}
            if any(field in attrs for field in mutable):
                raise serializers.ValidationError({"detail": "Only draft broadcasts can be edited."})
        return attrs
