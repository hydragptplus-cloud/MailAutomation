from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.db import transaction
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.utils.html import escape
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from common.permissions import RolePermission
from common.quotas import usage_snapshot, validate_email_quota, validate_organization_active
from common.tenancy import TenantViewSetMixin, request_organization
from recipients.models import Recipient
from .models import Campaign, CampaignClick, CampaignLog, CampaignUnsubscribe
from .serializers import CampaignLogSerializer, CampaignSerializer
from .tasks import launch_campaign, send_campaign_email
from .tracking import anonymized_ip_hash, read_click_token, read_unsubscribe_token


def _request_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return forwarded_for.split(",", 1)[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR", "")


def _unsubscribe_response(title, message, *, confirmation=False, status_code=200):
    form = ""
    if confirmation:
        form = (
            '<form method="post">'
            '<input type="hidden" name="List-Unsubscribe" value="One-Click">'
            '<button type="submit">Unsubscribe</button>'
            "</form>"
        )
    html = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex,nofollow">'
        f"<title>{escape(title)}</title>"
        "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#020617;color:#e2e8f0;font:16px system-ui,sans-serif}"
        "main{width:min(30rem,calc(100% - 3rem));padding:2rem;border:1px solid #1e293b;border-radius:1rem;background:#0f172a;text-align:center}"
        "h1{margin:0 0 .75rem;font-size:1.5rem}p{color:#94a3b8;line-height:1.6}button{margin-top:1rem;padding:.75rem 1.25rem;border:0;border-radius:.7rem;background:#4f46e5;color:white;font-weight:700;cursor:pointer}</style>"
        "</head><body><main>"
        f"<h1>{escape(title)}</h1><p>{escape(message)}</p>{form}"
        "</main></body></html>"
    )
    response = HttpResponse(html, status=status_code, content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response["Referrer-Policy"] = "no-referrer"
    response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    return response


class CampaignUnsubscribeView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def _campaign_log(self, token):
        try:
            log_id = read_unsubscribe_token(token)
            return CampaignLog.objects.select_related("organization").get(pk=log_id, organization__isnull=False)
        except (KeyError, TypeError, ValueError, CampaignLog.DoesNotExist):
            raise Http404("Unsubscribe link is invalid.")

    def get(self, request, token):
        campaign_log = self._campaign_log(token)
        return _unsubscribe_response(
            "Unsubscribe from emails",
            "Confirm that you want to stop receiving campaign emails from this organization.",
            confirmation=True,
        )

    def post(self, request, token):
        campaign_log = self._campaign_log(token)
        with transaction.atomic():
            affected = Recipient.objects.filter(
                organization_id=campaign_log.organization_id,
                email__iexact=campaign_log.recipient_email,
                status=Recipient.Status.ACTIVE,
            ).update(status=Recipient.Status.UNSUBSCRIBED)
            CampaignLog.objects.filter(
                organization_id=campaign_log.organization_id,
                recipient_email__iexact=campaign_log.recipient_email,
                status=CampaignLog.Status.PENDING,
            ).update(status=CampaignLog.Status.SKIPPED, message="Skipped: Recipient unsubscribed.")
            CampaignUnsubscribe.objects.get_or_create(
                campaign_log=campaign_log,
                defaults={
                    "recipient_email": campaign_log.recipient_email,
                    "affected_recipients": affected,
                    "ip_hash": anonymized_ip_hash(_request_ip(request)),
                    "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500],
                },
            )
        return _unsubscribe_response(
            "You are unsubscribed",
            "This email address will no longer receive campaign emails from this organization.",
        )


class CampaignClickRedirectView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            log_id, destination_url = read_click_token(token)
            campaign_log = CampaignLog.objects.only("id").get(pk=log_id)
        except (KeyError, TypeError, ValueError, CampaignLog.DoesNotExist):
            raise Http404("Tracking link is invalid.")

        CampaignClick.objects.create(
            campaign_log=campaign_log,
            destination_url=destination_url,
            ip_hash=anonymized_ip_hash(_request_ip(request)),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
        )
        response = HttpResponseRedirect(destination_url)
        response["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response["Referrer-Policy"] = "no-referrer"
        return response


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
        from django.db import transaction
        from rest_framework.exceptions import ValidationError

        with transaction.atomic():
            campaign = Campaign.objects.select_for_update().select_related(
                "template", "recipient_list", "smtp", "organization"
            ).get(pk=self.get_object().pk)

            if campaign.status in {Campaign.Status.QUEUED, Campaign.Status.SENDING}:
                raise ValidationError({"detail": "Campaign is already running or queued."})

            self._validate_launch(campaign)
            campaign.status = Campaign.Status.QUEUED
            campaign.save(update_fields=["status", "updated_at"])

            transaction.on_commit(lambda: launch_campaign.delay(campaign.id))

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
