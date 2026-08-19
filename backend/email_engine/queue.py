from typing import Any, cast

from campaigns.tasks import launch_campaign


def enqueue_campaign(campaign_id):
    return cast(Any, launch_campaign).delay(campaign_id)
