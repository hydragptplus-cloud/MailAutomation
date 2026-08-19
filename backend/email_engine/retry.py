from typing import Any, cast

from campaigns.models import CampaignLog
from campaigns.tasks import send_campaign_email


def retry_failed(campaign_id):
    ids = CampaignLog.objects.filter(campaign_id=campaign_id, status=CampaignLog.Status.FAILED).values_list("id", flat=True)
    for log_id in ids:
        cast(Any, send_campaign_email).delay(log_id)
