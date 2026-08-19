from rest_framework.permissions import BasePermission, SAFE_METHODS


class RolePermission(BasePermission):
    """Viewsets declare write_roles and optional action_roles; reads remain tenant-scoped."""

    def has_permission(self, request, view):  # pyright: ignore[reportIncompatibleMethodOverride]
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == "owner" or request.method in SAFE_METHODS:
            return True
        action_roles = getattr(view, "action_roles", {})
        allowed = action_roles.get(getattr(view, "action", None), getattr(view, "write_roles", set()))
        return user.role in allowed


class OwnerOnly(BasePermission):
    def has_permission(self, request, view):  # pyright: ignore[reportIncompatibleMethodOverride]
        return bool(request.user and request.user.is_authenticated and request.user.role == "owner")


class OwnerOrAdmin(BasePermission):
    def has_permission(self, request, view):  # pyright: ignore[reportIncompatibleMethodOverride]
        return bool(request.user and request.user.is_authenticated and request.user.role in {"owner", "admin"})
