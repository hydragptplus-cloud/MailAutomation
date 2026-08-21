from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import CampaignClickRedirectView, CampaignLogViewSet, CampaignUnsubscribeView, CampaignViewSet
router = DefaultRouter()
router.register("campaigns", CampaignViewSet, basename="campaign")
router.register("campaign-logs", CampaignLogViewSet, basename="campaign-log")
urlpatterns = [
    path("track/click/<str:token>/", CampaignClickRedirectView.as_view(), name="campaign-click"),
    path("unsubscribe/<str:token>/", CampaignUnsubscribeView.as_view(), name="campaign-unsubscribe"),
] + router.urls
