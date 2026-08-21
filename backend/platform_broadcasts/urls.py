from rest_framework.routers import DefaultRouter

from .views import PlatformBroadcastViewSet

router = DefaultRouter()
router.register("platform/broadcasts", PlatformBroadcastViewSet, basename="platform-broadcast")

urlpatterns = router.urls
