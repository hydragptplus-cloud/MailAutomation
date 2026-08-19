from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from common.permissions import RolePermission
from common.tenancy import TenantViewSetMixin, request_organization
from .builder import build_html
from .models import EmailTemplate
from .serializers import EmailTemplateSerializer
from .validators import validate_template


class EmailTemplateViewSet(TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = EmailTemplate.objects.select_related("created_by")
    serializer_class = EmailTemplateSerializer
    permission_classes = [RolePermission]
    write_roles = {"admin", "manager"}
    search_fields = ("title", "subject", "description")
    ordering_fields = ("created_at", "updated_at", "title")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, organization=request_organization(self.request))

    @action(detail=False, methods=["post"])
    def render_layout(self, request):
        return Response({"html": build_html(request.data.get("json_layout", {}))})

    @action(detail=True, methods=["get"])
    def validate(self, request, pk=None):
        obj = self.get_object()
        return Response({"errors": validate_template(obj.subject, obj.html)})
