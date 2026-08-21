from rest_framework import serializers
from common.tenancy import request_organization
from common.models import Organization
from common.plan_features import organization_mailbox_usage
from django.db import transaction
from .models import SMTPAccount


class SMTPAccountSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = SMTPAccount
        exclude = ("encrypted_password",)
        read_only_fields = ("organization", "sent_today", "sent_date", "created_at", "updated_at")

    def validate(self, attrs):
        if self.instance is None:
            organization = request_organization(self.context["request"])
            usage = organization_mailbox_usage(organization)
            if usage["used"] >= usage["limit"]:
                raise serializers.ValidationError({"detail": "SMTP account limit reached for this account."})
            if not attrs.get("password"):
                raise serializers.ValidationError({"password": "Password is required."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        organization = Organization.objects.select_for_update().get(pk=validated_data["organization"].pk)
        usage = organization_mailbox_usage(organization)
        if usage["used"] >= usage["limit"]:
            raise serializers.ValidationError({
                "detail": "SMTP account limit reached for this account.",
                "limit": usage["limit"],
                "used": usage["used"],
            })
        validated_data["organization"] = organization
        obj = SMTPAccount(**validated_data)
        obj.set_password(password)
        obj.save()
        return obj

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
