from datetime import timedelta
from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from django.conf import settings
from .models import UserLoginSession


class SessionJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)
        raw_token = request.COOKIES.get(settings.AUTH_ACCESS_COOKIE_NAME)
        if not raw_token:
            return None
        validated_token = self.get_validated_token(raw_token)
        self.enforce_csrf(request)
        return self.get_user(validated_token), validated_token

    @staticmethod
    def enforce_csrf(request):
        check = CSRFCheck(lambda req: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise PermissionDenied(f"CSRF validation failed: {reason}")

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        session_id = validated_token.get("session_id")
        if not session_id:
            raise AuthenticationFailed("Session is no longer valid.", code="session_revoked")
        try:
            session = UserLoginSession.objects.get(session_id=session_id, user=user, revoked_at__isnull=True)
        except (UserLoginSession.DoesNotExist, ValueError) as exc:
            raise AuthenticationFailed("Session is no longer valid.", code="session_revoked") from exc
        if session.last_seen_at < timezone.now() - timedelta(minutes=5):
            UserLoginSession.objects.filter(pk=session.pk).update(last_seen_at=timezone.now())
        return user
