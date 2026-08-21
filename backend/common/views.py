from django.db.models import Prefetch
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from common.permissions import OwnerOnly, OwnerOrAdmin
from common.plan_features import organization_has_support_workspace_plan
from common.tenancy import is_owner
from users.serializers import UserSerializer
from .models import Organization, OrganizationUsage
from .serializers import BillingConfigurationSerializer, OrganizationSerializer, OrganizationUsageSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [OwnerOnly]
    queryset = Organization.objects.all()
    search_fields = ("name", "status")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="create-admin")
    def create_admin(self, request, pk=None):
        data = request.data.copy()
        data["organization"] = self.get_object().pk
        data["role"] = "admin"
        serializer = UserSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        organization = self.get_object()
        organization.status = Organization.Status.SUSPENDED
        organization.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(organization).data)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        organization = self.get_object()
        organization.status = Organization.Status.ACTIVE
        organization.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(organization).data)

    @action(detail=True, methods=["post"], url_path="toggle-support-workspace")
    def toggle_support_workspace(self, request, pk=None):
        organization = self.get_object()
        enabled = request.data.get("enabled")
        wants_enabled = (not organization.support_workspace_enabled) if enabled is None else bool(enabled)
        if wants_enabled and not organization_has_support_workspace_plan(organization):
            return Response(
                {"detail": "Mail workspace is available only on Premium+ and Custom plans."},
                status=400,
            )
        if enabled is None:
            organization.support_workspace_enabled = not organization.support_workspace_enabled
        else:
            organization.support_workspace_enabled = bool(enabled)
        organization.save(update_fields=["support_workspace_enabled", "updated_at"])
        return Response(self.get_serializer(organization).data)


class OrganizationUsageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrganizationUsageSerializer
    permission_classes = [OwnerOrAdmin]
    filterset_fields = ("organization", "date")

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        qs = OrganizationUsage.objects.select_related("organization")
        organization = getattr(self.request.user, "organization", None)
        return qs if is_owner(self.request.user) else qs.filter(organization=organization)


class AccountSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = request.user.organization
        requested = request.query_params.get("organization")
        if is_owner(request.user) and requested:
            organization = Organization.objects.filter(pk=requested).first()
        if not organization:
            return Response({"detail": "No organization selected."}, status=400)
        return Response(OrganizationSerializer(organization).data)


class BillingConfigurationView(APIView):
    permission_classes = [OwnerOnly]

    def get_object(self):
        from billing.configuration import get_billing_configuration

        return get_billing_configuration()

    def get(self, request):
        return Response(BillingConfigurationSerializer(self.get_object()).data)

    def patch(self, request):
        serializer = BillingConfigurationSerializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)
