from .models import CampaignLog

def campaign_history(campaign_id):
    return CampaignLog.objects.filter(campaign_id=campaign_id).order_by("-updated_at")
