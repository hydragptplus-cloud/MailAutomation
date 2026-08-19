from campaigns.tasks import launch_campaign

def enqueue_campaign(campaign_id):
    return launch_campaign.delay(campaign_id)
