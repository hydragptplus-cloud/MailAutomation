from rest_framework.routers import DefaultRouter
from .views import EmailTemplateViewSet

router = DefaultRouter()
router.register("templates", EmailTemplateViewSet, basename="template")
urlpatterns = router.urls
