from rest_framework.routers import DefaultRouter
from .views import CampaignLogViewSet, CampaignViewSet
router = DefaultRouter()
router.register("campaigns", CampaignViewSet, basename="campaign")
router.register("campaign-logs", CampaignLogViewSet, basename="campaign-log")
urlpatterns = router.urls
