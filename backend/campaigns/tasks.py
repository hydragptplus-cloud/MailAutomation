import logging
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
    for campaign in get_due_campaigns().select_related("organization").iterator():
        if campaign.status == Campaign.Status.SCHEDULED:
            launch_campaign.delay(campaign.id)


@shared_task(bind=True)
def launch_campaign(self, campaign_id):
    with transaction.atomic():
        campaign = Campaign.objects.select_for_update(of=("self",)).select_related("organization", "recipient_list", "smtp").get(pk=campaign_id)
        if campaign.status in {Campaign.Status.CANCELLED, Campaign.Status.COMPLETED, Campaign.Status.RUNNING}:
            return {"detail": f"Campaign is already {campaign.status}."}
        count = campaign.recipient_list.recipients.filter(status="active", organization=campaign.organization).count() if campaign.recipient_list else 0
        try:
            if count <= 0:
                raise ValidationError({"detail": "Campaign has no active recipients."})
            validate_organization_active(campaign.organization)
            validate_email_quota(campaign.organization, count)
            if not campaign.smtp or not campaign.smtp.status:
                raise ValidationError({"detail": "A valid active SMTP account is required."})
            today_sent = campaign.smtp.sent_today if campaign.smtp.sent_date == timezone.localdate() else 0
            if count > max(campaign.smtp.daily_limit - today_sent, 0):
                raise ValidationError({"detail": "SMTP daily sending limit reached."})
            record_campaign_launch(campaign.organization_id)
        except ValidationError as exc:
            campaign.status = Campaign.Status.FAILED
            campaign.save(update_fields=["status"])
            return {"detail": exc.detail}
        campaign.status = Campaign.Status.QUEUED
        campaign.save(update_fields=["status"])
        create_campaign_logs(campaign)
        campaign.status = Campaign.Status.RUNNING
        campaign.started_at = timezone.now()
        campaign.save(update_fields=["status", "started_at"])

    log_ids = list(CampaignLog.objects.filter(campaign_id=campaign_id, status=CampaignLog.Status.PENDING).values_list("id", flat=True))
    if not log_ids:
        finalize_campaign.delay([], campaign_id)
        return {"queued": 0}
    header = [send_campaign_email.s(log_id) for log_id in log_ids]
    chord(header)(finalize_campaign.s(campaign_id))
    return {"queued": len(log_ids)}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_campaign_email(self, log_id):
    try:
        log = CampaignLog.objects.select_related("campaign", "organization").get(pk=log_id)
    except CampaignLog.DoesNotExist:
        return {"log_id": log_id, "status": "NOT_FOUND"}
    if log.status in {CampaignLog.Status.SENT, CampaignLog.Status.SKIPPED} or log.campaign.status in {
        Campaign.Status.CANCELLED, Campaign.Status.PAUSED, Campaign.Status.DRAFT
    }:
        return {"log_id": log_id, "status": log.status, "detail": "Campaign is not active"}
    if log.organization_id != log.campaign.organization_id:
        CampaignLog.objects.filter(pk=log_id).update(status=CampaignLog.Status.FAILED, message="Cross-organization campaign log rejected.")
        return {"log_id": log_id, "status": CampaignLog.Status.FAILED, "detail": "Cross-organization campaign log rejected."}
    from email_engine.sender import send_log_email
    try:
        return send_log_email(log_id)
    except Exception as exc:
        if self.request.retries < self.max_retries:
            CampaignLog.objects.filter(pk=log_id).update(status=CampaignLog.Status.PENDING, message=str(exc))
            raise self.retry(exc=exc)
        updated = CampaignLog.objects.filter(pk=log_id).exclude(status=CampaignLog.Status.FAILED).update(
            status=CampaignLog.Status.FAILED, message=str(exc), attempts=self.request.retries + 1
        )
        if updated:
            record_email_result(log.organization_id, sent=False)
        return {"log_id": log_id, "status": CampaignLog.Status.FAILED, "error": str(exc)}


@shared_task()
def finalize_campaign(results, campaign_id):
    campaign = Campaign.objects.get(pk=campaign_id)
    if campaign.status in {Campaign.Status.CANCELLED, Campaign.Status.PAUSED}:
        return {"campaign_id": campaign_id, "status": campaign.status}
    sent = campaign.logs.filter(status=CampaignLog.Status.SENT).count()
    failed = campaign.logs.filter(status=CampaignLog.Status.FAILED).count()
    campaign.sent_count, campaign.failed_count, campaign.finished_at = sent, failed, timezone.now()
    campaign.status = Campaign.Status.COMPLETED if sent > 0 and failed == 0 else Campaign.Status.FAILED
    campaign.save(update_fields=["sent_count", "failed_count", "finished_at", "status"])
    return {"campaign_id": campaign_id, "sent": sent, "failed": failed}
