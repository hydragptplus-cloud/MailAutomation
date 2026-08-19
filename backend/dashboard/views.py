from rest_framework.views import APIView
from rest_framework.response import Response
from .services import summary
from common.tenancy import is_owner

class DashboardSummaryView(APIView):
    def get(self, request):
        organization = None if is_owner(request.user) else request.user.organization
        return Response(summary(organization))
