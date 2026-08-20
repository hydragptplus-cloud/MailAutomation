from typing import cast

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from common.models import SystemSetting
from common.permissions import OwnerOrAdmin
from common.tenancy import is_owner, scope_queryset
from .models import User, UserLoginSession
from .serializers import (
    CustomTokenObtainPairSerializer,
    ProfileSerializer,
    SessionTokenRefreshSerializer,
    SystemSettingSerializer,
    UserLoginSessionSerializer,
    UserSerializer,
)


def _request_user(request) -> User:
    return cast(User, request.user)


def _is_last_active_admin(user):
    """Return True if *user* is the only active admin in their organization."""
    if user.role != User.Role.ADMIN or not user.organization:
        return False
    return not (
        User.objects.filter(
            organization=user.organization,
            role=User.Role.ADMIN,
            is_active=True,
        )
        .exclude(pk=user.pk)
        .exists()
    )


class CustomTokenObtainPairView(TokenObtainPairView):
    permission_classes = ()
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class CustomTokenRefreshView(TokenRefreshView):
    permission_classes = ()
    serializer_class = SessionTokenRefreshSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [OwnerOrAdmin]
    search_fields = ("username", "email", "name")
    filterset_fields = ("organization", "role", "is_active")

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        queryset = User.objects.select_related("organization").order_by("-date_joined")
        org_id = self.request.query_params.get("organization")
        if is_owner(_request_user(self.request)) and org_id:
            queryset = queryset.filter(organization_id=org_id)
        return scope_queryset(queryset, _request_user(self.request))

    def perform_create(self, serializer):
        actor = _request_user(self.request)
        role = serializer.validated_data.get("role", User.Role.OPERATOR)
        # Nobody can create an owner through the product API
        if role == User.Role.OWNER:
            raise ValidationError({"role": "Cannot create an owner through the API."})
        # Admin can only create users in their own organization
        if actor.role == User.Role.ADMIN:
            serializer.validated_data["organization"] = actor.organization
        serializer.save()

    def perform_update(self, serializer):
        actor = _request_user(self.request)
        instance = serializer.instance
        new_role = serializer.validated_data.get("role", instance.role)

        # Cannot edit an owner
        if instance.role == User.Role.OWNER:
            raise ValidationError({"detail": "Cannot modify the owner account."})
        # Cannot assign owner role
        if new_role == User.Role.OWNER:
            raise ValidationError({"role": "Cannot assign the owner role."})
        # Cannot demote yourself
        if instance.pk == actor.pk and new_role != instance.role:
            raise ValidationError({"role": "You cannot change your own role."})
        # Cannot demote the last active admin
        if (
            instance.role == User.Role.ADMIN
            and new_role != User.Role.ADMIN
            and _is_last_active_admin(instance)
        ):
            raise ValidationError(
                {"role": "Cannot demote the last active administrator."}
            )
        serializer.save()

    def perform_destroy(self, instance):
        actor = _request_user(self.request)
        if instance.pk == actor.pk:
            raise ValidationError({"detail": "You cannot delete your own account."})
        if instance.role == User.Role.OWNER:
            raise ValidationError({"detail": "Cannot delete the owner account."})
        if _is_last_active_admin(instance):
            raise ValidationError(
                {"detail": "Cannot delete the last active administrator."}
            )
        instance.delete()

    # ── Custom actions ────────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        """Admin/owner sets a temporary password for another user."""
        target = cast(User, self.get_object())
        actor = _request_user(request)
        if target.role == User.Role.OWNER and actor.pk != target.pk:
            return Response(
                {"detail": "Cannot reset the owner's password."},
                status=status.HTTP_403_FORBIDDEN,
            )
        password = request.data.get("password", "")
        if not password:
            return Response(
                {"detail": "Password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(password, user=target)
        except DjangoValidationError as exc:
            return Response(
                {"detail": list(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.set_password(password)
        target.save(update_fields=["password"])
        # Revoke all active sessions for this user
        UserLoginSession.objects.filter(
            user=target, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        return Response({"detail": "Password updated and sessions revoked."})

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        target = cast(User, self.get_object())
        actor = _request_user(request)
        if target.pk == actor.pk:
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.role == User.Role.OWNER:
            return Response(
                {"detail": "Cannot deactivate the owner account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if _is_last_active_admin(target):
            return Response(
                {"detail": "Cannot deactivate the last active administrator."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.is_active = False
        target.save(update_fields=["is_active"])
        # Also revoke sessions
        UserLoginSession.objects.filter(
            user=target, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        return Response({"detail": "User deactivated."})

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        target = cast(User, self.get_object())
        target.is_active = True
        target.save(update_fields=["is_active"])
        return Response({"detail": "User reactivated."})

    @action(detail=True, methods=["post"], url_path="revoke-sessions")
    def revoke_sessions(self, request, pk=None):
        target = cast(User, self.get_object())
        count = UserLoginSession.objects.filter(
            user=target, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        return Response({"detail": f"{count} session(s) revoked."})


class SettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _setting(self, request):
        organization = _request_user(request).organization
        return SystemSetting.objects.get_or_create(organization=organization)[0] if organization else None

    def get(self, request):
        setting_obj = self._setting(request)
        if not setting_obj:
            return Response({"detail": "Select an organization."}, status=400)
        return Response(SystemSettingSerializer(setting_obj).data)

    def patch(self, request):
        if _request_user(request).role not in {"owner", "admin"}:
            return Response({"detail": "You do not have permission to change settings."}, status=403)
        serializer = SystemSettingSerializer(self._setting(request), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(_request_user(request)).data)

    def patch(self, request):
        serializer = ProfileSerializer(_request_user(request), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    def post(self, request):
        user = _request_user(request)
        if not user.check_password(request.data.get("current_password")):
            return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(request.data.get("new_password"), user=user)
        except ValidationError as exc:
            return Response({"detail": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(request.data["new_password"])
        user.save(update_fields=["password"])
        UserLoginSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
        return Response({"detail": "Password updated. Please sign in again."})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session_id = request.auth.get("session_id") if request.auth else None
        user = _request_user(request)
        UserLoginSession.objects.filter(
            user=user, session_id=session_id, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        return Response({"detail": "Signed out."})


class SessionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserLoginSessionSerializer
    permission_classes = [OwnerOrAdmin]

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        qs = UserLoginSession.objects.select_related("user", "user__organization")
        user = _request_user(self.request)
        return qs if is_owner(user) else qs.filter(user__organization=user.organization)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        session = cast(UserLoginSession, self.get_object())
        session.revoked_at = timezone.now()
        session.save(update_fields=["revoked_at"])
        return Response({"detail": "Session revoked."})
