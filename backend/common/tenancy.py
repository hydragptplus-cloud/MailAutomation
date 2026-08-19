from rest_framework.exceptions import PermissionDenied, ValidationError
from typing import Any


def is_owner(user):
    return bool(user and user.is_authenticated and user.role == "owner")


def request_organization(request, *, required=True):
    user = request.user
    organization = getattr(user, "organization", None)
    if is_owner(user):
        requested_id = request.data.get("organization") if hasattr(request, "data") else None
        requested_id = requested_id or request.query_params.get("organization")
        if requested_id:
            from common.models import Organization
            try:
                return Organization.objects.get(pk=requested_id)
            except Organization.DoesNotExist as exc:
                raise ValidationError({"organization": "Organization not found."}) from exc
    if required and organization is None:
        raise PermissionDenied("Your user is not assigned to an organization.")
    return organization


def scope_queryset(queryset, user, organization_field="organization"):
    if is_owner(user):
        return queryset
    organization_id = getattr(user, "organization_id", None)
    if not organization_id:
        return queryset.none()
    return queryset.filter(**{f"{organization_field}_id": organization_id})


def ensure_same_organization(organization, **objects):
    errors = {}
    for field, obj in objects.items():
        if obj is not None and getattr(obj, "organization_id", None) != organization.id:
            errors[field] = "This resource does not belong to your organization."
    if errors:
        raise ValidationError(errors)


class TenantViewSetMixin:
    organization_field = "organization"
    request: Any

    def get_queryset(self):
        return scope_queryset(super().get_queryset(), self.request.user, self.organization_field)  # pyright: ignore[reportAttributeAccessIssue]

    def perform_create(self, serializer):
        organization = request_organization(self.request)
        serializer.save(organization=organization, created_by=self.request.user)
