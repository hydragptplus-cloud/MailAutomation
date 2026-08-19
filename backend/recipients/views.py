from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.conf import settings
from common.permissions import RolePermission
from common.tenancy import TenantViewSetMixin, request_organization
from .exporter import export_csv
from .importer import import_recipients
from .models import Recipient, RecipientList
from .serializers import RecipientListSerializer, RecipientSerializer


class RecipientListViewSet(TenantViewSetMixin, viewsets.ModelViewSet):
    queryset = RecipientList.objects.all().order_by("-created_at")
    serializer_class = RecipientListSerializer
    permission_classes = [RolePermission]
    write_roles = {"admin", "manager"}
    search_fields = ("list_name", "description")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, organization=request_organization(self.request))


class RecipientViewSet(TenantViewSetMixin, viewsets.ModelViewSet):
    throttle_scope = None
    queryset = Recipient.objects.select_related("recipient_list").all().order_by("-created_at")
    serializer_class = RecipientSerializer
    permission_classes = [RolePermission]
    write_roles = {"admin", "manager"}
    filterset_fields = ("recipient_list", "status", "company")
    search_fields = ("name", "email", "company", "phone")
    ordering_fields = ("name", "email", "created_at")

    def get_queryset(self):
        qs = super().get_queryset()
        list_param = self.request.query_params.get("list_id") or self.request.query_params.get("recipient_list") or self.request.query_params.get("recipient_list_id")
        if list_param:
            qs = qs.filter(recipient_list_id=list_param)
        if self.request.query_params.get("tag"):
            qs = qs.filter(tags__contains=[self.request.query_params["tag"]])
        return qs

    def perform_create(self, serializer):
        serializer.save(organization=request_organization(self.request))

    @action(detail=False, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="file_import")
    def import_file(self, request):
        organization = request_organization(request)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "File upload is required"}, status=400)
        max_bytes = settings.DATA_UPLOAD_MAX_MEMORY_SIZE
        if file_obj.size > max_bytes:
            return Response({"detail": "Import file is too large."}, status=400)
        list_id = request.data.get("recipient_list") or request.data.get("list_id")
        if list_id:
            recipient_list = RecipientList.objects.filter(pk=list_id, organization=organization).first()
            if not recipient_list:
                return Response({"detail": "Recipient list not found."}, status=400)
        else:
            recipient_list, _ = RecipientList.objects.get_or_create(
                organization=organization, list_name="General Contacts",
                defaults={"description": "Default list for imported recipients", "created_by": request.user},
            )
        try:
            return Response(import_recipients(file_obj, recipient_list))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

    @action(detail=False, methods=["get"])
    def export_file(self, request):
        return export_csv(self.filter_queryset(self.get_queryset()))

    @action(detail=False, methods=["post"])
    def bulk_update(self, request):
        count = self.get_queryset().filter(pk__in=request.data.get("ids", [])).update(status=request.data.get("status", "active"))
        return Response({"updated": count})

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        count, _ = self.get_queryset().filter(pk__in=request.data.get("ids", [])).delete()
        return Response({"deleted": count})
