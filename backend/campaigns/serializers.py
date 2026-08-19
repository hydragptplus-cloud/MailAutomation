from rest_framework import serializers
from common.tenancy import ensure_same_organization, request_organization
from .models import Campaign, CampaignLog


class CampaignSerializer(serializers.ModelSerializer):
    progress_percent = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = "__all__"
        read_only_fields = ("organization", "created_by", "created_at", "started_at", "finished_at", "total_count", "sent_count", "failed_count")

    def validate(self, attrs):
        organization = request_organization(self.context["request"])
        ensure_same_organization(
            organization,
            template=attrs.get("template", getattr(self.instance, "template", None)),
            recipient_list=attrs.get("recipient_list", getattr(self.instance, "recipient_list", None)),
            smtp=attrs.get("smtp", getattr(self.instance, "smtp", None)),
        )
        return attrs

    def get_progress_percent(self, obj):
        return round(((obj.sent_count + obj.failed_count) / obj.total_count) * 100, 2) if obj.total_count else 0


class CampaignLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignLog
        fields = "__all__"
        read_only_fields = fields
