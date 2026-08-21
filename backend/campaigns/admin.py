from django.contrib import admin
from .models import Campaign, CampaignClick, CampaignLog, CampaignUnsubscribe
admin.site.register(Campaign)
admin.site.register(CampaignLog)
admin.site.register(CampaignClick)
admin.site.register(CampaignUnsubscribe)
