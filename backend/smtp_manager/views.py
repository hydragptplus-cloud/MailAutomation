from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from common.permissions import RolePermission
from common.tenancy import TenantViewSetMixin, request_organization
from common.quotas import record_email_result, validate_email_quota
from django.utils import timezone
from .models import SMTPAccount
from .serializers import SMTPAccountSerializer
from .tester import test_smtp, send_test_mail


class SMTPAccountViewSet(TenantViewSetMixin, viewsets.ModelViewSet):
    throttle_scope = None
    queryset = SMTPAccount.objects.all().order_by("-created_at")
    serializer_class = SMTPAccountSerializer
    permission_classes = [RolePermission]
    write_roles = {"admin"}
    action_roles = {"test_connection_hyphen": {"admin"}, "test_connection_underscore": {"admin"}, "send_test_hyphen": {"admin"}, "send_test_underscore": {"admin"}}
    search_fields = ("name", "host", "username", "from_email")

    def perform_create(self, serializer):
        serializer.save(organization=request_organization(self.request))

    @action(detail=True, methods=["post"], url_path="test-connection", throttle_classes=[ScopedRateThrottle], throttle_scope="smtp_test")
    def test_connection_hyphen(self, request, pk=None):
        return self._do_test_connection()

    @action(detail=True, methods=["post"], url_path="test_connection", throttle_classes=[ScopedRateThrottle], throttle_scope="smtp_test")
    def test_connection_underscore(self, request, pk=None):
        return self._do_test_connection()

    def _do_test_connection(self):
        try:
            result = test_smtp(self.get_object())
            return Response(result, status=status.HTTP_200_OK if result.get("ok") else status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"ok": False, "message": "SMTP connection test failed."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="send-test", throttle_classes=[ScopedRateThrottle], throttle_scope="smtp_test")
    def send_test_hyphen(self, request, pk=None):
        return self._do_send_test(request)

    @action(detail=True, methods=["post"], url_path="send_test", throttle_classes=[ScopedRateThrottle], throttle_scope="smtp_test")
    def send_test_underscore(self, request, pk=None):
        return self._do_send_test(request)

    def _do_send_test(self, request):
        recipient_email = request.data.get("recipient_email") or request.data.get("email")
        if not recipient_email:
            return Response({"detail": "recipient_email is required"}, status=400)
        try:
            account = self.get_object()
            validate_email_quota(account.organization, 1)
            sent_today = account.sent_today if account.sent_date == timezone.localdate() else 0
            if sent_today >= account.daily_limit:
                return Response({"detail": "SMTP daily sending limit reached."}, status=400)
            result = send_test_mail(account, recipient_email)
            record_email_result(account.organization_id, sent=bool(result.get("ok")))
            if result.get("ok"):
                if account.sent_date != timezone.localdate():
                    account.sent_today = 0
                    account.sent_date = timezone.localdate()
                account.sent_today += 1
                account.save(update_fields=["sent_today", "sent_date"])
            return Response(result, status=200 if result.get("ok") else 400)
        except Exception:
            return Response({"ok": False, "message": "Test email could not be delivered."}, status=400)
