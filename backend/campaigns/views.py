from django.utils.dateparse import parse_datetime
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from common.permissions import RolePermission
from common.quotas import usage_snapshot, validate_email_quota, validate_organization_active
from common.tenancy import TenantViewSetMixin, request_organization
from .models import Campaign, CampaignLog
from .serializers import CampaignLogSerializer, CampaignSerializer
from .tasks import launch_campaign, send_campaign_email


class CampaignViewSet(TenantViewSetMixin, viewsets.ModelViewSet):
    throttle_scope = None
    queryset = Campaign.objects.select_related("template", "recipient_list", "smtp", "created_by").all().order_by("-created_at")
    serializer_class = CampaignSerializer
    permission_classes = [RolePermission]
    write_roles = {"admin", "manager"}
    action_roles = {
        "launch": {"admin", "manager", "operator"}, "start": {"admin", "manager", "operator"},
        "pause": {"admin", "manager", "operator"}, "resume": {"admin", "manager", "operator"},
        "cancel": {"admin", "manager", "operator"}, "retry_failed": {"admin", "manager", "operator"},
        "schedule_campaign": {"admin", "manager"},
    }
    filterset_fields = ("status", "template", "recipient_list", "smtp")
    search_fields = ("name", "subject")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, organization=request_organization(self.request))

    def _validate_launch(self, campaign, count=None):
        if campaign.status == Campaign.Status.CANCELLED:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Campaign is cancelled and cannot be re-launched."})
        validate_organization_active(campaign.organization)
        count = count if count is not None else campaign.recipient_list.recipients.filter(status="active").count()
        if count <= 0:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Campaign has no active recipients."})
        validate_email_quota(campaign.organization, count)
        if usage_snapshot(campaign.organization)["campaigns_remaining"] <= 0:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Daily campaign limit reached for this account."})
        if not campaign.smtp or not campaign.smtp.status:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "A valid active SMTP account is required."})
        today_sent = campaign.smtp.sent_today if campaign.smtp.sent_date == timezone.localdate() else 0
        if count > max(campaign.smtp.daily_limit - today_sent, 0):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "SMTP daily sending limit reached."})
        return count

    @action(detail=True, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="campaign_launch")
    def launch(self, request, pk=None):
        return self._do_launch()

    @action(detail=True, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="campaign_launch")
    def start(self, request, pk=None):
        return self._do_launch()

    def _do_launch(self):
        campaign = self.get_object()
        self._validate_launch(campaign)
        launch_campaign.delay(campaign.id)
        return Response({"detail": "Campaign queued successfully.", "status": Campaign.Status.QUEUED})

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        campaign = self.get_object()
        campaign.status = Campaign.Status.PAUSED
        campaign.save(update_fields=["status"])
        CampaignLog.objects.filter(campaign=campaign, status=CampaignLog.Status.PROCESSING).update(status=CampaignLog.Status.PENDING)
        return Response({"detail": "Campaign paused.", "status": campaign.status})

    @action(detail=True, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="campaign_launch")
    def resume(self, request, pk=None):
        return self._do_launch()

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        campaign = self.get_object()
        campaign.status = Campaign.Status.CANCELLED
        campaign.save(update_fields=["status"])
        CampaignLog.objects.filter(campaign=campaign, status__in=[CampaignLog.Status.PENDING, CampaignLog.Status.PROCESSING]).update(status=CampaignLog.Status.SKIPPED, message="Campaign cancelled by user.")
        return Response({"detail": "Campaign cancelled.", "status": campaign.status})

    @action(detail=True, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="campaign_launch")
    def retry_failed(self, request, pk=None):
        campaign = self.get_object()
        failed_qs = CampaignLog.objects.filter(campaign=campaign, status=CampaignLog.Status.FAILED)
        ids = list(failed_qs.values_list("id", flat=True))
        self._validate_launch(campaign, len(ids))
        failed_qs.update(status=CampaignLog.Status.PENDING)
        for log_id in ids:
            send_campaign_email.delay(log_id)
        return Response({"detail": f"Retried {len(ids)} failed logs."})

    @action(detail=True, methods=["post"])
    def schedule_campaign(self, request, pk=None):
        campaign = self.get_object()
        value = parse_datetime(request.data.get("scheduled_at", ""))
        if not value:
            return Response({"detail": "A valid ISO-8601 scheduled_at is required."}, status=400)
        self._validate_launch(campaign)
        campaign.scheduled_at, campaign.status = value, Campaign.Status.SCHEDULED
        campaign.save(update_fields=["scheduled_at", "status"])
        return Response(self.get_serializer(campaign).data)

    @action(detail=True, methods=["get"])
    def progress(self, request, pk=None):
        campaign = self.get_object()
        counts = {s: campaign.logs.filter(status=s).count() for s, _ in CampaignLog.Status.choices}
        return Response({"campaign": self.get_serializer(campaign).data, "counts": counts})


class CampaignLogViewSet(TenantViewSetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = CampaignLog.objects.select_related("campaign", "recipient").all().order_by("-created_at")
    serializer_class = CampaignLogSerializer
    permission_classes = [RolePermission]
    filterset_fields = ("campaign", "status", "recipient_email")
    search_fields = ("recipient_email", "message")
