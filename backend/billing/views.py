from typing import Any, cast

from django.conf import settings
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework import viewsets
from common.permissions import OwnerOnly

from .blockchain import VerificationError, inspect_bsc_wallet_transfer, verify_invoice_transfer
from .models import PaymentInvoice, PaymentTransferLedger, Plan
from .serializers import (
    AccountCustomInvoiceCreateSerializer, AccountInvoiceCreateSerializer, CheckoutEmailStartSerializer, CheckoutEmailVerifySerializer,
    CustomInvoiceCreateSerializer, FreeSignupSerializer, InvoiceCreateSerializer, InvoiceRecoverSerializer, InvoiceReplaceSerializer,
    InvoiceSerializer, ManualReviewActionSerializer, PaymentTransferLedgerSerializer, PlanAdminSerializer,
    PlanSerializer, BscTransactionInspectSerializer, TransactionSubmissionSerializer,
)
from .services import (
    authorize_checkout_session, cancel_invoice, consume_precheckout_session, exchange_invoice_code,
    checkout_cookie_name, fulfill_paid_invoice, replace_invoice, resolve_manual_transfer,
    provision_free_account, record_review_claim, serialize_invoice_access, start_checkout_email_verification,
    verify_checkout_email,
)


def _cookie_name(name):
    return checkout_cookie_name(name)


def _checkout_cookie_samesite():
    return getattr(settings, "CHECKOUT_SESSION_COOKIE_SAMESITE", "Lax")


class CsrfProtectedAPIView(APIView):
    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)


class CsrfBootstrapView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class PlanListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        plans = Plan.objects.filter(is_active=True)
        return Response(PlanSerializer(plans, many=True).data)


class PlanAdminViewSet(viewsets.ModelViewSet):
    serializer_class = PlanAdminSerializer
    permission_classes = [OwnerOnly]
    queryset = Plan.objects.all().order_by("display_order", "price_bdt")
    http_method_names = ["get", "post", "put", "patch", "head", "options"]


class PaymentReviewViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentTransferLedgerSerializer
    permission_classes = [OwnerOnly]
    queryset = PaymentTransferLedger.objects.select_related("invoice", "invoice__plan").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        resolution = self.request.query_params.get("resolution")
        if resolution:
            queryset = queryset.filter(resolution=resolution)
        return queryset

    def action(self, request, pk=None):
        ledger = self.get_object()
        serializer = ManualReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ledger = resolve_manual_transfer(
            ledger.pk,
            serializer.validated_data["action"],
            actor=request.user,
            notes=serializer.validated_data.get("notes", ""),
            refund_transaction_hash=serializer.validated_data.get("refund_transaction_hash", ""),
        )
        return Response(PaymentTransferLedgerSerializer(ledger).data)


class BscTransactionInspectView(APIView):
    permission_classes = [OwnerOnly]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "transaction_verify"

    def post(self, request):
        serializer = BscTransactionInspectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        try:
            return Response(inspect_bsc_wallet_transfer(validated_data["transaction"]))
        except VerificationError as exc:
            return Response({
                "found": False,
                "matched_wallet": False,
                "reason": str(exc),
                "transfers": [],
                "matching_transfers": [],
            }, status=400)


class FreeSignupView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_signup"

    def post(self, request):
        serializer = FreeSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization, user = provision_free_account(serializer.validated_data, request)

        from rest_framework_simplejwt.tokens import RefreshToken
        from users.models import UserLoginSession
        from users.serializers import UserSerializer, _request_ip
        import uuid

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
            ip_address=_request_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:1000] if request else ""),
        )

        response = Response({
            "detail": "Your free account is ready.",
            "user": UserSerializer(user).data,
            "organization_id": organization.pk,
            "email": user.email,
            "login_url": "/login",
        }, status=status.HTTP_201_CREATED)
        from users.views import _set_auth_cookies
        return _set_auth_cookies(request, response, str(refresh.access_token), str(refresh))


class CheckoutEmailStartView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout_email"

    def post(self, request):
        serializer = CheckoutEmailStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        start_checkout_email_verification(
            validated_data["email"],
            validated_data.get("turnstile_token", ""),
            request=request,
        )
        return Response({"detail": "If the address can continue, a verification code will be sent shortly."}, status=202)


class CheckoutEmailVerifyView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout_email"

    def post(self, request):
        serializer = CheckoutEmailVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        token = verify_checkout_email(
            validated_data["email"],
            validated_data["code"],
            request=request,
        )
        response = Response({"detail": "Email verified."}, status=202)
        response.set_cookie(
            key=_cookie_name(settings.PRECHECKOUT_SESSION_COOKIE_NAME),
            value=token,
            max_age=20 * 60,
            secure=settings.CHECKOUT_SESSION_COOKIE_SECURE,
            httponly=True,
            samesite=_checkout_cookie_samesite(),
            path="/",
        )
        return response


class InvoiceCreateView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_signup"

    def post(self, request):
        serializer = InvoiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        if not consume_precheckout_session(request, validated_data["email"]):
            existing = None
            idempotency_key = (validated_data.get("idempotency_key", "") or "").strip()[:96]
            if idempotency_key:
                existing = PaymentInvoice.objects.filter(
                    normalized_customer_email=validated_data["email"],
                    idempotency_key=idempotency_key,
                    status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING, PaymentInvoice.Status.EXPIRED),
                ).order_by("-created_at").first()
            if not existing:
                from .services import normalized_org_name

                existing = PaymentInvoice.objects.filter(
                    normalized_customer_email=validated_data["email"],
                    normalized_organization_name=normalized_org_name(validated_data["organization_name"]),
                    status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING),
                    expires_at__gt=timezone.now(),
                ).order_by("-created_at").first()
            if not existing or not authorize_checkout_session(request, existing):
                return Response({"detail": "Verify your email before creating a paid invoice."}, status=403)
        invoice, token, created = serializer.save()
        data = dict(InvoiceSerializer(invoice).data)
        response = Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        response.delete_cookie(
            _cookie_name(settings.PRECHECKOUT_SESSION_COOKIE_NAME),
            path="/",
            samesite=_checkout_cookie_samesite(),
        )
        return _set_checkout_cookie(response, token)


class CustomInvoiceCreateView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_signup"

    def post(self, request):
        serializer = CustomInvoiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        if not consume_precheckout_session(request, validated_data["email"]):
            existing = None
            idempotency_key = (validated_data.get("idempotency_key", "") or "").strip()[:96]
            if idempotency_key:
                existing = PaymentInvoice.objects.filter(
                    normalized_customer_email=validated_data["email"],
                    idempotency_key=idempotency_key,
                    status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING, PaymentInvoice.Status.EXPIRED),
                ).order_by("-created_at").first()
            if not existing:
                from .services import normalized_org_name

                existing = PaymentInvoice.objects.filter(
                    normalized_customer_email=validated_data["email"],
                    normalized_organization_name=normalized_org_name(validated_data["organization_name"]),
                    status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING),
                    expires_at__gt=timezone.now(),
                ).order_by("-created_at").first()
            if not existing or not authorize_checkout_session(request, existing):
                return Response({"detail": "Verify your email before creating a paid invoice."}, status=403)
        invoice, token, created = serializer.save()
        data = dict(InvoiceSerializer(invoice).data)
        response = Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        response.delete_cookie(
            _cookie_name(settings.PRECHECKOUT_SESSION_COOKIE_NAME),
            path="/",
            samesite=_checkout_cookie_samesite(),
        )
        return _set_checkout_cookie(response, token)


class AccountInvoiceCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_signup"

    def post(self, request):
        if request.user.role != "admin" or not request.user.organization_id:
            return Response({"detail": "Only an organization administrator can change its subscription."}, status=403)
        serializer = AccountInvoiceCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        invoice, token, created = serializer.save()
        data = InvoiceSerializer(invoice).data
        return _set_checkout_cookie(
            Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK),
            token,
        )


class AccountCustomInvoiceCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_signup"

    def post(self, request):
        if request.user.role != "admin" or not request.user.organization_id:
            return Response({"detail": "Only an organization administrator can change its subscription."}, status=403)
        serializer = AccountCustomInvoiceCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        invoice, token, created = serializer.save()
        return _set_checkout_cookie(
            Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK),
            token,
        )


def _is_org_admin_for_invoice(request, invoice):
    user = request.user
    return (
        user
        and user.is_authenticated
        and getattr(user, "role", None) == "admin"
        and invoice.organization_id
        and invoice.organization_id == getattr(user, "organization_id", None)
    )


def _authorize_invoice_request(request, invoice):
    if _is_org_admin_for_invoice(request, invoice):
        return None
    if authorize_checkout_session(request, invoice):
        return None
    return Response({"detail": "Invoice access is unauthorized."}, status=401)


def _set_checkout_cookie(response, token):
    response.set_cookie(
        key=_cookie_name(settings.CHECKOUT_SESSION_COOKIE_NAME),
        value=token,
        max_age=12 * 60 * 60,
        secure=settings.CHECKOUT_SESSION_COOKIE_SECURE,
        httponly=True,
        samesite=_checkout_cookie_samesite(),
        path="/",
    )
    return response


def _invoice_response(invoice, token=None, response_status=200):
    data = dict(InvoiceSerializer(invoice).data)
    if token:
        data.update(serialize_invoice_access(invoice, token))
    return Response(data, status=response_status)


def _expire_if_needed(invoice):
    if invoice.status == PaymentInvoice.Status.PENDING and invoice.expires_at <= timezone.now():
        invoice.status = PaymentInvoice.Status.EXPIRED
        invoice.password_hash = ""
        invoice.save(update_fields=("status", "password_hash", "updated_at"))
        from .services import revoke_invoice_access

        revoke_invoice_access(invoice)
    return invoice


def _transfer_was_after_expiry(invoice, transfer):
    if not getattr(transfer, "occurred_at", None):
        raise DRFValidationError({"detail": "The transfer timestamp could not be trusted."})
    return transfer.occurred_at > invoice.expires_at


def _mark_manual_review(invoice, transfer):
    invoice.transaction_hash = transfer.transaction_hash
    invoice.transfer_index = transfer.transfer_index
    invoice.verification_data = transfer.raw
    invoice.verification_error = "Payment was sent after the quote expired and needs manual review."
    invoice.password_hash = ""
    invoice.status = PaymentInvoice.Status.MANUAL_REVIEW
    invoice.save(update_fields=(
        "transaction_hash", "transfer_index", "verification_data", "verification_error",
        "password_hash", "status", "updated_at",
    ))
    from .tasks import send_manual_review_email

    transaction.on_commit(lambda: cast(Any, send_manual_review_email).delay(str(invoice.pk)))
    return invoice


class InvoiceDetailView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, invoice_id):
        return PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)

    def get(self, request, invoice_id):
        try:
            invoice = self.get_object(invoice_id)
        except PaymentInvoice.DoesNotExist:
            return Response({"detail": "Invoice not found."}, status=404)
        auth_result = _authorize_invoice_request(request, invoice)
        if isinstance(auth_result, Response):
            return auth_result
        invoice = _expire_if_needed(invoice)
        return _invoice_response(invoice, token=auth_result)


class CurrentInvoiceView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.COOKIES.get(_cookie_name(settings.CHECKOUT_SESSION_COOKIE_NAME), "")
        if not token:
            return Response({"detail": "Invoice access is unauthorized."}, status=401)
        from .services import invoice_token_digest
        from .models import CheckoutSession

        session = CheckoutSession.objects.select_related("invoice", "invoice__plan").filter(
            token_digest=invoice_token_digest(token),
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).order_by("-created_at").first()
        if not session:
            return Response({"detail": "Invoice access is unauthorized."}, status=401)
        session.last_used_at = timezone.now()
        session.save(update_fields=("last_used_at",))
        invoice = _expire_if_needed(session.invoice)
        return _invoice_response(invoice)


class InvoiceSessionExchangeView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invoice_recover"

    def post(self, request, invoice_id):
        code = (request.data.get("code") or "").strip()
        if not code:
            return Response({"detail": "Invoice access is unauthorized."}, status=401)
        try:
            invoice, session_token = exchange_invoice_code(invoice_id, code, request=request)
        except PaymentInvoice.DoesNotExist:
            return Response({"detail": "Invoice not found."}, status=404)
        except DRFValidationError as exc:
            return Response(exc.detail, status=401)
        response = _invoice_response(_expire_if_needed(invoice))
        return _set_checkout_cookie(response, session_token)


class InvoiceVerifyView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "payment_verify"

    def post(self, request, invoice_id):
        submission = TransactionSubmissionSerializer(data=request.data)
        submission.is_valid(raise_exception=True)
        validated_submission = cast(dict[str, Any], submission.validated_data or {})
        restore_status = PaymentInvoice.Status.PENDING
        try:
            with transaction.atomic():
                invoice = PaymentInvoice.objects.select_for_update(of=("self",)).select_related("plan").get(pk=invoice_id)
                auth_result = _authorize_invoice_request(request, invoice)
                if isinstance(auth_result, Response):
                    return auth_result
                if invoice.status == PaymentInvoice.Status.PAID:
                    return Response(InvoiceSerializer(invoice).data)
                invoice = _expire_if_needed(invoice)
                restore_status = (
                    PaymentInvoice.Status.EXPIRED
                    if invoice.status == PaymentInvoice.Status.EXPIRED
                    else PaymentInvoice.Status.PENDING
                )
                if invoice.status not in {PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING, PaymentInvoice.Status.EXPIRED}:
                    return Response({"detail": "This invoice cannot be verified."}, status=400)
                invoice.status = PaymentInvoice.Status.VERIFYING
                invoice.verification_error = ""
                invoice.save(update_fields=("status", "verification_error", "updated_at"))
            transfer = verify_invoice_transfer(invoice, validated_submission["transaction"])
            if _transfer_was_after_expiry(invoice, transfer):
                with transaction.atomic():
                    invoice = PaymentInvoice.objects.select_for_update(of=("self",)).get(pk=invoice_id)
                    record_review_claim(invoice, transfer, "late_payment")
                    invoice = _mark_manual_review(invoice, transfer)
                return Response(InvoiceSerializer(invoice).data, status=202)
            invoice = fulfill_paid_invoice(invoice.pk, transfer)
            if invoice.status == PaymentInvoice.Status.MANUAL_REVIEW:
                return Response(InvoiceSerializer(invoice).data, status=202)
            return Response(InvoiceSerializer(invoice).data)
        except PaymentInvoice.DoesNotExist:
            return Response({"detail": "Invoice not found."}, status=404)
        except VerificationError as exc:
            PaymentInvoice.objects.filter(pk=invoice_id, status=PaymentInvoice.Status.VERIFYING).update(
                status=restore_status, verification_error=str(exc)
            )
            return Response({"detail": str(exc)}, status=400)
        except DRFValidationError:
            review_invoice = PaymentInvoice.objects.filter(pk=invoice_id, status=PaymentInvoice.Status.MANUAL_REVIEW).first()
            if review_invoice:
                return Response(InvoiceSerializer(review_invoice).data, status=202)
            PaymentInvoice.objects.filter(pk=invoice_id, status=PaymentInvoice.Status.VERIFYING).update(status=restore_status)
            raise


class InvoiceRecoverView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invoice_recover"

    def post(self, request):
        serializer = InvoiceRecoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from .tasks import send_recovery_email

        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        cast(Any, send_recovery_email).delay(validated_data["email"])
        return Response({"detail": "If an active invoice exists for that email, a secure link will be sent shortly."}, status=202)


class InvoiceReplaceView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_signup"

    def post(self, request, invoice_id):
        try:
            invoice = PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)
        except PaymentInvoice.DoesNotExist:
            return Response({"detail": "Invoice not found."}, status=404)
        auth_result = _authorize_invoice_request(request, invoice)
        if isinstance(auth_result, Response):
            return auth_result
        serializer = InvoiceReplaceSerializer(data=request.data, context={"invoice": invoice})
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data or {})
        new_invoice, token = replace_invoice(invoice, validated_data["password_hash"])
        return _set_checkout_cookie(_invoice_response(new_invoice, response_status=201), token)


class InvoiceCancelView(CsrfProtectedAPIView):
    permission_classes = [AllowAny]

    def post(self, request, invoice_id):
        try:
            invoice = PaymentInvoice.objects.get(pk=invoice_id)
        except PaymentInvoice.DoesNotExist:
            return Response({"detail": "Invoice not found."}, status=404)
        auth_result = _authorize_invoice_request(request, invoice)
        if isinstance(auth_result, Response):
            return auth_result
        return Response(InvoiceSerializer(cancel_invoice(invoice)).data)


class PublicLandingMonitorView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from datetime import timedelta
        from django.db.models import Q
        from billing.configuration import get_billing_configuration
        from campaigns.models import CampaignLog
        from smtp_manager.models import SMTPAccount

        config = get_billing_configuration()
        if not getattr(config, "public_landing_monitor_active", True):
            return Response({
                "is_active": False,
                "message": "Mail Flow is inactive - data not available",
            })

        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)

        # 30-day server-wide stats
        sent_logs = CampaignLog.objects.filter(
            status=CampaignLog.Status.SENT,
            created_at__gte=thirty_days_ago
        )
        failed_logs = CampaignLog.objects.filter(
            status=CampaignLog.Status.FAILED,
            created_at__gte=thirty_days_ago
        )
        delivered_count = sent_logs.count()
        failed_count = failed_logs.count()
        total_attempts = delivered_count + failed_count

        if total_attempts > 0:
            success_rate = round((delivered_count / total_attempts) * 100, 1)
        else:
            success_rate = 100.0

        in_queue_count = CampaignLog.objects.filter(
            status__in=[CampaignLog.Status.PENDING, CampaignLog.Status.PROCESSING]
        ).count()

        # 12-day breakdown
        daily_bars = []
        for i in range(11, -1, -1):
            day_date = (now - timedelta(days=i)).date()
            day_start = timezone.make_aware(timezone.datetime.combine(day_date, timezone.datetime.min.time()))
            day_end = timezone.make_aware(timezone.datetime.combine(day_date, timezone.datetime.max.time()))

            day_sent = CampaignLog.objects.filter(
                status=CampaignLog.Status.SENT,
                created_at__gte=day_start,
                created_at__lte=day_end
            ).count()

            day_failed = CampaignLog.objects.filter(
                status=CampaignLog.Status.FAILED,
                created_at__gte=day_start,
                created_at__lte=day_end
            ).count()

            daily_bars.append({
                "date": day_date.strftime("%Y-%m-%d"),
                "label": day_date.strftime("%b %d"),
                "delivered": day_sent,
                "failed": day_failed,
                "total": day_sent + day_failed,
            })

        max_day_volume = max([d["total"] for d in daily_bars] or [0])
        for bar in daily_bars:
            if max_day_volume > 0:
                bar["percentage"] = max(15, round((bar["total"] / max_day_volume) * 100))
            else:
                bar["percentage"] = 25  # pleasant baseline aesthetic if no dispatch on that day

        # SMTP Relay Health
        active_routes = SMTPAccount.objects.filter(status=True).count()
        delivery_incidents = failed_count

        return Response({
            "is_active": True,
            "metrics": {
                "delivered": delivered_count,
                "success_rate": success_rate,
                "in_queue": in_queue_count,
            },
            "daily_bars": daily_bars,
            "relay_health": {
                "active_routes": active_routes,
                "delivery_incidents": delivery_incidents,
            },
        })

