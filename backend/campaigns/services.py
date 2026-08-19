from django.db import transaction
from recipients.models import Recipient
from .models import CampaignLog

@transaction.atomic
def create_campaign_logs(campaign):
    recipients = Recipient.objects.filter(organization=campaign.organization, recipient_list=campaign.recipient_list, status=Recipient.Status.ACTIVE)
    logs = [CampaignLog(organization=campaign.organization, campaign=campaign, recipient=r, recipient_email=r.email) for r in recipients.iterator(chunk_size=1000)]
    CampaignLog.objects.bulk_create(logs, ignore_conflicts=True, batch_size=1000)
    total = CampaignLog.objects.filter(campaign=campaign).count()
    campaign.total_count = total
    campaign.save(update_fields=["total_count"])
    return total
