from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import AccountSummaryView, BillingConfigurationView, OrganizationUsageViewSet, OrganizationViewSet

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("organization-usage", OrganizationUsageViewSet, basename="organization-usage")
urlpatterns = [
    path("account/", AccountSummaryView.as_view(), name="account-summary"),
    path("platform/billing-configuration/", BillingConfigurationView.as_view(), name="billing-configuration"),
    *router.urls,
]
