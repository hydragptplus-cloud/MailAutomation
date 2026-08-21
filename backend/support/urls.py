from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PublicSupportTicketView, SupportMailboxViewSet, SupportTicketViewSet, SupportWorkspaceAccessView

router = DefaultRouter()
router.register("support/tickets", SupportTicketViewSet, basename="support-ticket")
router.register("support/mailboxes", SupportMailboxViewSet, basename="support-mailbox")

urlpatterns = [
    path("support/public/", PublicSupportTicketView.as_view(), name="support-public"),
    path("support/workspace-access/", SupportWorkspaceAccessView.as_view(), name="support-workspace-access"),
    *router.urls,
]
