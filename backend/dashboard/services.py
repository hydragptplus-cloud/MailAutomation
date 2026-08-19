from campaigns.models import Campaign, CampaignLog
from recipients.models import Recipient
from templates_app.models import EmailTemplate

from common.quotas import usage_snapshot


def summary(organization=None):
    templates = EmailTemplate.objects.all()
    recipients = Recipient.objects.all()
    campaigns = Campaign.objects.all()
    logs = CampaignLog.objects.all()
    if organization is not None:
        templates = templates.filter(organization=organization)
        recipients = recipients.filter(organization=organization)
        campaigns = campaigns.filter(organization=organization)
        logs = logs.filter(organization=organization)
    return {
        "templates": templates.count(),
        "recipients": recipients.count(),
        "campaigns": campaigns.count(),
        "sent_emails": logs.filter(status=CampaignLog.Status.SENT).count(),
        "failed_emails": logs.filter(status=CampaignLog.Status.FAILED).count(),
        "recent_campaigns": list(campaigns.values("id", "name", "status", "created_at", "sent_count", "failed_count")[:10]),
        "quota": usage_snapshot(organization) if organization is not None else None,
    }
