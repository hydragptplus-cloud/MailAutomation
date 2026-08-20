from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from .services import summary
from common.tenancy import is_owner

class DashboardSummaryView(APIView):
    def get(self, request):
        if is_owner(request.user):
            organization = None
        else:
            organization = getattr(request.user, "organization", None)
            if not organization:
                raise PermissionDenied("Your user is not assigned to an organization.")
        return Response(summary(organization))
