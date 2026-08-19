from django.http import HttpResponse

def health_check(request):
    return HttpResponse("Mail Flow API is running")
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from users.views import CustomTokenObtainPairView, CustomTokenRefreshView

urlpatterns = [
    path('', health_check, name='health'),
    path("admin/", admin.site.urls),
    path("api/auth/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("api/dashboard/", include("dashboard.urls")),
    path("api/", include("templates_app.urls")),
    path("api/", include("recipients.urls")),
    path("api/", include("smtp_manager.urls")),
    path("api/", include("campaigns.urls")),
    path("api/", include("users.urls")),
    path("api/", include("common.urls")),
    path("api/reports/", include("reports.urls")),
    path("api/billing/", include("billing.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
