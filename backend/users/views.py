from typing import cast

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
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

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        queryset = User.objects.select_related("organization").order_by("-date_joined")
        return scope_queryset(queryset, _request_user(self.request))

    def perform_destroy(self, instance):
        if instance == _request_user(self.request):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "You cannot delete your own account."})
        instance.delete()


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
