from typing import cast

import uuid
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.middleware.csrf import get_token


def _set_auth_cookies(request, response, access, refresh=None):
    get_token(request)
    cookie_options = {
        "secure": settings.SESSION_COOKIE_SECURE,
        "httponly": True,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "path": "/api/",
    }
    response.set_cookie(settings.AUTH_ACCESS_COOKIE_NAME, access, max_age=5 * 60, **cookie_options)
    if refresh:
        response.set_cookie(settings.AUTH_REFRESH_COOKIE_NAME, refresh, max_age=24 * 60 * 60, **cookie_options)
    return response


def _clear_auth_cookies(response):
    response.delete_cookie(settings.AUTH_ACCESS_COOKIE_NAME, path="/api/", samesite=settings.AUTH_COOKIE_SAMESITE)
    response.delete_cookie(settings.AUTH_REFRESH_COOKIE_NAME, path="/api/", samesite=settings.AUTH_COOKIE_SAMESITE)
    return response
from common.models import SystemSetting
from common.permissions import OwnerOrAdmin
from common.tenancy import is_owner, scope_queryset
from common.utils import get_client_ip
from .models import User, UserLoginSession
from .serializers import (
    CustomTokenObtainPairSerializer,
    ProfileSerializer,
    SessionTokenRefreshSerializer,
    SystemSettingSerializer,
    UserLoginSessionSerializer,
    UserSerializer,
)
from .two_factor import (
    create_challenge_token,
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_totp_uri,
    verify_and_consume_backup_code,
    verify_challenge_token,
    verify_totp,
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

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code < 400 and isinstance(response.data, dict) and response.data.get("access"):
            access = response.data.pop("access")
            refresh = response.data.pop("refresh", None)
            _set_auth_cookies(request, response, access, refresh)
        return response


class CustomTokenRefreshView(TokenRefreshView):
    permission_classes = ()
    serializer_class = SessionTokenRefreshSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        data = request.data.copy()
        if not data.get("refresh"):
            data["refresh"] = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME, "")
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        access = payload.pop("access")
        refresh = payload.pop("refresh", None)
        response = Response(payload)
        return _set_auth_cookies(request, response, access, refresh)


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

    @action(detail=True, methods=["post"], url_path="reset-2fa")
    def reset_2fa(self, request, pk=None):
        """Admin/Owner resets another user's 2FA."""
        target = cast(User, self.get_object())
        actor = _request_user(request)
        if target.role == User.Role.OWNER:
            return Response(
                {"detail": "Cannot reset 2FA for the owner account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if target.pk == actor.pk:
            return Response(
                {"detail": "Use your profile settings to manage your own 2FA."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.two_factor_enabled = False
        target.two_factor_secret = ""
        target.two_factor_backup_codes = []
        target.save(update_fields=["two_factor_enabled", "two_factor_secret", "two_factor_backup_codes"])
        return Response({"detail": f"2FA has been reset for {target.email}."})


class SettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _setting(self, request):
        user = _request_user(request)
        if user.organization:
            return SystemSetting.objects.get_or_create(organization=user.organization)[0]
        # Owner-managed platform settings must never fall back to an
        # organization's configuration.
        setting = SystemSetting.objects.filter(organization__isnull=True).first()
        return setting or SystemSetting.objects.create(organization=None)

    def get(self, request):
        setting_obj = self._setting(request)
        if not setting_obj:
            return Response({"detail": "System settings not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(SystemSettingSerializer(setting_obj).data)

    def patch(self, request):
        user = _request_user(request)
        if user.role not in {"owner", "admin"}:
            return Response({"detail": "You do not have permission to change settings."}, status=status.HTTP_403_FORBIDDEN)
        setting_obj = self._setting(request)
        if not setting_obj:
            return Response({"detail": "System settings not found."}, status=status.HTTP_404_NOT_FOUND)
        data = request.data.copy()
        if user.role != "owner":
            data.pop("app_name", None)
        serializer = SystemSettingSerializer(setting_obj, data=data, partial=True)
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
        return _clear_auth_cookies(Response({"detail": "Signed out."}))


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


# ── Two-Factor Authentication Views ──────────────────────────────────

def _request_ip_raw(request):
    ip = get_client_ip(request)
    return ip if ip != "unknown" else None


class TwoFactorSetupView(APIView):
    """Generate a TOTP secret + QR code for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _request_user(request)
        if user.two_factor_enabled:
            return Response(
                {"detail": "2FA is already enabled on your account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        secret = generate_totp_secret()
        uri = get_totp_uri(user, secret)
        qr_code = generate_qr_code_base64(uri)
        return Response({
            "secret": secret,
            "otpauth_uri": uri,
            "qr_code": qr_code,
        })


class TwoFactorConfirmView(APIView):
    """Confirm TOTP setup by verifying a test code, then activate 2FA."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _request_user(request)
        secret = request.data.get("secret", "")
        code = request.data.get("code", "")
        if not secret or not code:
            return Response(
                {"detail": "Both secret and code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not verify_totp(secret, code):
            return Response(
                {"detail": "Invalid verification code. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Generate backup codes
        plain_codes, hashed_codes = generate_backup_codes()
        user.two_factor_secret = secret
        user.two_factor_enabled = True
        user.two_factor_backup_codes = hashed_codes
        user.save(update_fields=["two_factor_secret", "two_factor_enabled", "two_factor_backup_codes"])
        return Response({
            "detail": "Two-factor authentication has been enabled.",
            "backup_codes": plain_codes,
        })


class TwoFactorDisableView(APIView):
    """Disable 2FA after verifying current password."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _request_user(request)
        password = request.data.get("password", "")
        if not password:
            return Response(
                {"detail": "Current password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.check_password(password):
            return Response(
                {"detail": "Incorrect password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.two_factor_enabled = False
        user.two_factor_secret = ""
        user.two_factor_backup_codes = []
        user.save(update_fields=["two_factor_enabled", "two_factor_secret", "two_factor_backup_codes"])
        return Response({"detail": "Two-factor authentication has been disabled."})


class TwoFactorBackupCodesView(APIView):
    """Regenerate backup recovery codes."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = _request_user(request)
        password = request.data.get("password", "")
        if not password:
            return Response(
                {"detail": "Current password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.check_password(password):
            return Response(
                {"detail": "Incorrect password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.two_factor_enabled:
            return Response(
                {"detail": "2FA is not enabled on your account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        plain_codes, hashed_codes = generate_backup_codes()
        user.two_factor_backup_codes = hashed_codes
        user.save(update_fields=["two_factor_backup_codes"])
        return Response({
            "detail": "Backup codes have been regenerated.",
            "backup_codes": plain_codes,
        })


class TwoFactorVerifyLoginView(APIView):
    """Public endpoint to complete 2FA login with a TOTP or backup code."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        challenge_token = request.data.get("challenge_token", "")
        code = request.data.get("code", "").strip()
        if not challenge_token or not code:
            return Response(
                {"detail": "Challenge token and verification code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = verify_challenge_token(challenge_token)
        if not user:
            return Response(
                {"detail": "Challenge expired or invalid. Please sign in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Try TOTP first, then backup code
        valid = False
        if len(code) == 6 and code.isdigit():
            valid = verify_totp(user.two_factor_secret, code)
        if not valid:
            valid = verify_and_consume_backup_code(user, code)
        if not valid:
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Issue full JWT tokens and create session
        if user.role == User.Role.OWNER:
            UserLoginSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
        session_id = uuid.uuid4()
        refresh = RefreshToken.for_user(user)
        refresh["session_id"] = str(session_id)
        refresh["role"] = user.role
        refresh["organization_id"] = user.organization.id if user.organization else None
        refresh["username"] = user.username
        refresh["email"] = user.email
        UserLoginSession.objects.create(
            user=user,
            session_id=session_id,
            refresh_token_jti=str(refresh["jti"]),
            ip_address=_request_ip_raw(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:1000],
        )
        response = Response({
            "user": UserSerializer(user).data,
        })
        return _set_auth_cookies(request, response, str(refresh.access_token), str(refresh))
