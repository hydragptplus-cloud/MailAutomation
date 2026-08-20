from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.renderers import JSONRenderer, BaseRenderer

from .exporter import export_csv, export_excel
from .services import (
    campaign_report_detail,
    campaign_reports_list,
    delivery_logs_list,
    summary_report,
)
from common.tenancy import is_owner


from rest_framework.exceptions import PermissionDenied


def _organization(request):
    if is_owner(request.user):
        return None
    organization = getattr(request.user, "organization", None)
    if not organization:
        raise PermissionDenied("Your user is not assigned to an organization.")
    return organization


def _params(request) -> dict:
    """Return query-params as a plain dict; works for both DRF and plain Django requests."""
    qp = getattr(request, "query_params", None)
    if qp is not None and hasattr(qp, "dict"):
        return qp.dict()
    return dict(request.GET)

class ReportsSummaryView(APIView):
    def get(self, request):
        data = summary_report(_params(request), _organization(request))
        return Response(data)

class CampaignReportsView(APIView):
    def get(self, request):
        items = campaign_reports_list(_params(request), _organization(request))
        return Response({"count": len(items), "results": items})

class CampaignReportDetailView(APIView):
    def get(self, request, campaign_id):
        data = campaign_report_detail(campaign_id, _organization(request))
        if not data:
            return Response({"detail": "Campaign not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(data)

class DeliveryLogsView(APIView):
    def get(self, request):
        items = delivery_logs_list(_params(request), _organization(request))
        return Response({"count": len(items), "results": items})

class CSVRenderer(BaseRenderer):
    media_type = 'text/csv'
    format = 'csv'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

class XLSXRenderer(BaseRenderer):
    media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    format = 'xlsx'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

class ReportsExportView(APIView):
    renderer_classes = [JSONRenderer, CSVRenderer, XLSXRenderer]
    def get(self, request):
        params = _params(request)
        export_type = params.get("type", "campaigns")
        fmt = params.get("format", "csv")

        if export_type == "logs":
            logs = delivery_logs_list(params, _organization(request))
            if fmt == "json":
                return Response(logs)
            headers = ["Log ID", "Campaign", "Recipient", "Status", "Message", "Timestamp"]
            rows = [[l["id"], l["campaign_name"], l["recipient_email"], l["status"], l["message"], l["sent_at"]] for l in logs]
            if fmt == "xlsx":
                return export_excel("delivery_logs.xlsx", headers, rows)
            return export_csv("delivery_logs.csv", headers, rows)
        else:
            campaigns = campaign_reports_list(params, _organization(request))
            if fmt == "json":
                return Response(campaigns)
            headers = ["Campaign ID", "Campaign Name", "Subject", "Status", "Recipients", "Sent", "Failed", "Success Rate (%)"]
            rows = [[c["id"], c["name"], c["subject"], c["status"], c["total_recipients"], c["sent_count"], c["failed_count"], c["success_rate"]] for c in campaigns]
            if fmt == "xlsx":
                return export_excel("campaign_reports.xlsx", headers, rows)
            return export_csv("campaign_reports.csv", headers, rows)


