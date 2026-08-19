from rest_framework.routers import DefaultRouter
from .views import SMTPAccountViewSet
router = DefaultRouter()
router.register("smtp-accounts", SMTPAccountViewSet, basename="smtp-account")
urlpatterns = router.urls
