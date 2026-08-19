from django.urls import path
from .views import (
    CampaignReportDetailView,
    CampaignReportsView,
    DeliveryLogsView,
    ReportsExportView,
    ReportsSummaryView,
)

urlpatterns = [
    path("summary/", ReportsSummaryView.as_view(), name="reports-summary"),
    path("campaigns/", CampaignReportsView.as_view(), name="reports-campaigns"),
    path("campaigns/<int:campaign_id>/", CampaignReportDetailView.as_view(), name="reports-campaign-detail"),
    path("delivery-logs/", DeliveryLogsView.as_view(), name="reports-delivery-logs"),
    path("export/", ReportsExportView.as_view(), name="reports-export"),
]

