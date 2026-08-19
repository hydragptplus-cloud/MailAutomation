from datetime import timedelta
from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from .models import UserLoginSession


class SessionJWTAuthentication(JWTAuthentication):
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
