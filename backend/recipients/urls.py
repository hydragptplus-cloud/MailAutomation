from rest_framework.routers import DefaultRouter
from .views import RecipientListViewSet, RecipientViewSet
router = DefaultRouter()
router.register("recipient-lists", RecipientListViewSet, basename="recipient-list")
router.register("recipients", RecipientViewSet, basename="recipient")
urlpatterns = router.urls
