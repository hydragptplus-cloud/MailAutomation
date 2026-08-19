from rest_framework import serializers
from common.tenancy import request_organization
from common.models import Organization
from django.db import transaction
from .models import Recipient, RecipientList


class RecipientListSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="list_name", required=False)
    recipient_count = serializers.IntegerField(source="recipients.count", read_only=True)

    class Meta:
        model = RecipientList
        fields = "__all__"
        read_only_fields = ("organization", "created_by", "created_at")


class RecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipient
        fields = "__all__"
        read_only_fields = ("organization", "created_at")

    def validate_recipient_list(self, value):
        organization = request_organization(self.context["request"])
        if value.organization_id != organization.id:
            raise serializers.ValidationError("This list does not belong to your organization.")
        return value

    def validate(self, attrs):
        if self.instance is None:
            organization = request_organization(self.context["request"])
            if organization.recipients.count() >= organization.max_recipients:
                raise serializers.ValidationError({"detail": "Recipient limit reached for this account."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        organization = Organization.objects.select_for_update().get(pk=validated_data["organization"].pk)
        if organization.recipients.count() >= organization.max_recipients:
            raise serializers.ValidationError({"detail": "Recipient limit reached for this account."})
        validated_data["organization"] = organization
        return super().create(validated_data)
