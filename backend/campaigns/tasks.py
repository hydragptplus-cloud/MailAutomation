import logging
from typing import Any, cast

from celery import chord, shared_task
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from common.quotas import record_campaign_launch, record_email_result, validate_email_quota, validate_organization_active
from .models import Campaign, CampaignLog
from .scheduler import get_due_campaigns
from .services import create_campaign_logs

logger = logging.getLogger("campaigns.tasks")


@shared_task()
def dispatch_scheduled_campaigns():
    for campaign in cast(Any, get_due_campaigns().select_related("organization").iterator()):
        campaign_obj = cast(Any, campaign)
        if campaign_obj.status == Campaign.Status.SCHEDULED:
            cast(Any, launch_campaign).delay(campaign_obj.id)


@shared_task(bind=True)
def launch_campaign(self, campaign_id):
    with transaction.atomic():
        campaign = cast(Any, Campaign.objects.select_for_update(of=("self",)).select_related("organization", "recipient_list", "smtp").get(pk=campaign_id))
        campaign_obj = cast(Any, campaign)
        if campaign_obj.status in {Campaign.Status.CANCELLED, Campaign.Status.COMPLETED, Campaign.Status.RUNNING}:
            return {"detail": f"Campaign is already {campaign_obj.status}."}
        count = campaign_obj.recipient_list.recipients.filter(status="active", organization=campaign_obj.organization).count() if campaign_obj.recipient_list else 0
        try:
            if count <= 0:
                raise ValidationError({"detail": "Campaign has no active recipients."})
            validate_organization_active(campaign_obj.organization)
            validate_email_quota(campaign_obj.organization, count)
            if not campaign_obj.smtp or not campaign_obj.smtp.status:
                raise ValidationError({"detail": "A valid active SMTP account is required."})
            today_sent = campaign_obj.smtp.sent_today if campaign_obj.smtp.sent_date == timezone.localdate() else 0
            if count > max(campaign_obj.smtp.daily_limit - today_sent, 0):
                raise ValidationError({"detail": "SMTP daily sending limit reached."})
            record_campaign_launch(campaign_obj.organization_id)
        except ValidationError as exc:
            campaign_obj.status = Campaign.Status.FAILED
            campaign_obj.save(update_fields=["status"])
            return {"detail": exc.detail}
        campaign_obj.status = Campaign.Status.QUEUED
        campaign_obj.save(update_fields=["status"])
        create_campaign_logs(campaign_obj)
        campaign_obj.status = Campaign.Status.RUNNING
        campaign_obj.started_at = timezone.now()
        campaign_obj.save(update_fields=["status", "started_at"])

    log_ids = list(cast(Any, CampaignLog.objects.filter(campaign_id=campaign_id, status=CampaignLog.Status.PENDING).values_list("id", flat=True)))
    if not log_ids:
        cast(Any, finalize_campaign).delay([], campaign_id)
        return {"queued": 0}
    header = [cast(Any, send_campaign_email).s(log_id) for log_id in log_ids]
    chord(header)(cast(Any, finalize_campaign).s(campaign_id))
    return {"queued": len(log_ids)}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_campaign_email(self, log_id):
    try:
        log = cast(Any, CampaignLog.objects.select_related("campaign", "organization").get(pk=log_id))
    except CampaignLog.DoesNotExist:
        return {"log_id": log_id, "status": "NOT_FOUND"}
    log_obj = cast(Any, log)
    if log_obj.status in {CampaignLog.Status.SENT, CampaignLog.Status.SKIPPED} or log_obj.campaign.status in {
        Campaign.Status.CANCELLED, Campaign.Status.PAUSED, Campaign.Status.DRAFT
    }:
        return {"log_id": log_id, "status": log_obj.status, "detail": "Campaign is not active"}
    if log_obj.organization_id != log_obj.campaign.organization_id:
        CampaignLog.objects.filter(pk=log_id).update(status=CampaignLog.Status.FAILED, message="Cross-organization campaign log rejected.")
        return {"log_id": log_id, "status": CampaignLog.Status.FAILED, "detail": "Cross-organization campaign log rejected."}
    from email_engine.sender import send_log_email
    try:
        return send_log_email(log_id)
    except Exception:
        safe_error = "Email delivery failed."
        if self.request.retries < self.max_retries:
            CampaignLog.objects.filter(pk=log_id).update(status=CampaignLog.Status.PENDING, message=safe_error)
            raise self.retry(exc=RuntimeError(safe_error)) from None
        updated = CampaignLog.objects.filter(pk=log_id).exclude(status=CampaignLog.Status.FAILED).update(
            status=CampaignLog.Status.FAILED, message=safe_error, attempts=self.request.retries + 1
        )
        if updated:
            record_email_result(log_obj.organization_id, sent=False)
        return {"log_id": log_id, "status": CampaignLog.Status.FAILED, "error": safe_error}


@shared_task()
def finalize_campaign(results, campaign_id):
    campaign = cast(Any, Campaign.objects.get(pk=campaign_id))
    campaign_obj = cast(Any, campaign)
    if campaign_obj.status in {Campaign.Status.CANCELLED, Campaign.Status.PAUSED}:
        return {"campaign_id": campaign_id, "status": campaign_obj.status}
    sent = cast(Any, campaign_obj.logs).filter(status=CampaignLog.Status.SENT).count()
    failed = cast(Any, campaign_obj.logs).filter(status=CampaignLog.Status.FAILED).count()
    campaign_obj.sent_count, campaign_obj.failed_count, campaign_obj.finished_at = sent, failed, timezone.now()
    campaign_obj.status = Campaign.Status.COMPLETED if sent > 0 and failed == 0 else Campaign.Status.FAILED
    campaign_obj.save(update_fields=["sent_count", "failed_count", "finished_at", "status"])
    return {"campaign_id": campaign_id, "sent": sent, "failed": failed}
