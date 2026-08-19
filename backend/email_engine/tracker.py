from campaigns.models import CampaignLog

def get_tracking_summary(campaign_id):
    qs = CampaignLog.objects.filter(campaign_id=campaign_id)
    return {status: qs.filter(status=status).count() for status, _ in CampaignLog.Status.choices}
