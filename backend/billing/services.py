import hashlib
import hmac
import json
import secrets
import time
import uuid
from base64 import urlsafe_b64encode
from datetime import timedelta
from decimal import Decimal, ROUND_UP
from typing import Any, cast
from urllib.parse import quote

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, models, transaction
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from common.models import Organization
from .models import (
    CheckoutEmailVerification, CheckoutSession, FreePlanClaim, InvoiceAccessCode, PaymentInvoice,
    PaymentSecurityAuditEvent, PaymentTransferLedger, Plan, PreCheckoutSession, Subscription,
)
from .configuration import get_runtime_billing_configuration

User = get_user_model()


ACTIVE_INVOICE_STATUSES = (
    PaymentInvoice.Status.PENDING,
    PaymentInvoice.Status.VERIFYING,
)

DECIMALS_BY_NETWORK = {
    "bsc": 18,
    "ethereum": 6,
    "tron": 6,
    "ton": 6,
}


class InvoiceConflict(APIException):
    status_code = 409
    default_code = "invoice_conflict"


from common.utils import get_client_ip


def client_ip(request):
    return get_client_ip(request)


def private_hash(value):
    return hmac.new(settings.SECRET_KEY.encode(), value.strip().lower().encode(), hashlib.sha256).hexdigest()


def invoice_token_digest(token):
    return hmac.new(settings.SECRET_KEY.encode(), token.encode(), hashlib.sha256).hexdigest()


def checkout_cookie_name(base_name):
    return f"__Host-{base_name}" if settings.CHECKOUT_SESSION_COOKIE_SECURE else base_name


def normalized_email(value):
    raw = (value or "").strip().lower()
    if "@" not in raw:
        return raw
    local_part, domain = raw.split("@", 1)
    local_part = local_part.split("+", 1)[0]
    if domain in {"gmail.com", "googlemail.com"}:
        local_part = local_part.replace(".", "")
        domain = "gmail.com"
    return f"{local_part}@{domain}"


def normalized_org_name(value):
    return " ".join((value or "").strip().lower().split())


def amount_to_raw(amount, decimals):
    return (Decimal(amount) * (Decimal(10) ** int(decimals))).quantize(Decimal("1"))


def audit_event(event_type, *, invoice=None, ledger=None, actor=None, request=None, metadata=None):
    PaymentSecurityAuditEvent.objects.create(
        event_type=event_type,
        invoice=invoice,
        ledger=ledger,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        ip_hash=private_hash(client_ip(request)) if request else "",
        metadata=metadata or {},
    )


def verify_turnstile(token, request):
    secret = getattr(settings, "TURNSTILE_SECRET_KEY", "")
    if not secret:
        if getattr(settings, "IS_PRODUCTION", False):
            raise ValidationError({"turnstile_token": "Checkout verification is not configured."})
        return True
    try:
        response = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret, "response": token, "remoteip": client_ip(request)},
            timeout=8,
        )
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ValidationError({"turnstile_token": "Checkout verification is temporarily unavailable."}) from exc
    if not payload.get("success"):
        raise ValidationError({"turnstile_token": "Checkout verification failed."})
    expected_hostnames = [
        hostname.strip()
        for hostname in getattr(settings, "TURNSTILE_EXPECTED_HOSTNAME", "").split(",")
        if hostname.strip()
    ]
    if expected_hostnames and payload.get("hostname") not in expected_hostnames:
        raise ValidationError({"turnstile_token": "Checkout verification failed."})
    expected_action = getattr(settings, "TURNSTILE_CHECKOUT_ACTION", "")
    if expected_action and payload.get("action") != expected_action:
        raise ValidationError({"turnstile_token": "Checkout verification failed."})
    challenge_ts = payload.get("challenge_ts")
    if challenge_ts:
        from django.utils.dateparse import parse_datetime

        parsed = parse_datetime(challenge_ts)
        if not parsed or timezone.now() - parsed > timedelta(minutes=5):
            raise ValidationError({"turnstile_token": "Checkout verification expired."})
    return True


def send_checkout_otp(email, code):
    relay_url = getattr(settings, "MAIL_FLOW_OTP_RELAY_URL", "")
    relay_secret = getattr(settings, "MAIL_FLOW_OTP_RELAY_SECRET", "")
    if relay_url and relay_secret:
        timestamp = str(int(time.time()))
        body = {
            "email": email,
            "code": code,
            "timestamp": timestamp,
        }
        signed_payload = json.dumps(body, separators=(",", ":"), sort_keys=True)
        signature = hmac.new(relay_secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
        response = requests.post(
            relay_url,
            json=body,
            headers={
                "X-Mail-Flow-Signature": signature,
                "X-Mail-Flow-Timestamp": timestamp,
            },
            timeout=getattr(settings, "MAIL_FLOW_OTP_RELAY_TIMEOUT", 10),
        )
        response.raise_for_status()
        return

    send_mail(
        "Verify your Mail Flow checkout",
        f"Your Mail Flow checkout code is {code}. It expires in 10 minutes.",
        settings.DEFAULT_FROM_EMAIL,
        [email],
        fail_silently=False,
    )


@transaction.atomic
def start_checkout_email_verification(email, turnstile_token, *, request=None):
    verify_turnstile(turnstile_token, request)
    email = normalized_email(email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    CheckoutEmailVerification.objects.filter(
        normalized_email=email, used_at__isnull=True, expires_at__gt=timezone.now(),
    ).update(used_at=timezone.now())
    CheckoutEmailVerification.objects.create(
        normalized_email=email,
        email=email,
        code_digest=private_hash(code),
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    from .tasks import send_checkout_otp_email

    transaction.on_commit(lambda: cast(Any, send_checkout_otp_email).delay(email, code))
    audit_event("checkout_email_otp_started", request=request, metadata={"email_hash": private_hash(email)})


@transaction.atomic
def verify_checkout_email(email, code, *, request=None):
    email = normalized_email(email)
    challenge = CheckoutEmailVerification.objects.select_for_update().filter(
        normalized_email=email,
        used_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).order_by("-created_at").first()
    if not challenge:
        raise ValidationError({"detail": "The verification code is invalid or expired."})
    if challenge.attempts >= 5:
        challenge.used_at = timezone.now()
        challenge.save(update_fields=("used_at",))
        raise ValidationError({"detail": "The verification code is invalid or expired."})
    challenge.attempts += 1
    if private_hash(code) != challenge.code_digest:
        challenge.save(update_fields=("attempts",))
        raise ValidationError({"detail": "The verification code is invalid or expired."})
    challenge.used_at = timezone.now()
    challenge.save(update_fields=("attempts", "used_at"))
    token = secrets.token_urlsafe(32)
    PreCheckoutSession.objects.filter(normalized_email=email, revoked_at__isnull=True).update(revoked_at=timezone.now())
    PreCheckoutSession.objects.create(
        normalized_email=email,
        token_digest=invoice_token_digest(token),
        expires_at=timezone.now() + timedelta(minutes=20),
    )
    audit_event("checkout_email_otp_verified", request=request, metadata={"email_hash": private_hash(email)})
    return token


def authorize_precheckout_session(request, email):
    token = request.COOKIES.get(checkout_cookie_name(settings.PRECHECKOUT_SESSION_COOKIE_NAME), "")
    if not token:
        return False
    return PreCheckoutSession.objects.filter(
        normalized_email=normalized_email(email),
        token_digest=invoice_token_digest(token),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).exists()


def consume_precheckout_session(request, email):
    token = request.COOKIES.get(checkout_cookie_name(settings.PRECHECKOUT_SESSION_COOKIE_NAME), "")
    if not token:
        return False
    updated = PreCheckoutSession.objects.select_for_update().filter(
        normalized_email=normalized_email(email),
        token_digest=invoice_token_digest(token),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).update(revoked_at=timezone.now())
    return bool(updated)


def _fernet():
    key = getattr(settings, "FIELD_ENCRYPTION_KEY", None)
    if not key:
        key = urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()).decode()
    from cryptography.fernet import Fernet

    return Fernet(key.encode())


def _encrypt_token(token):
    fernet = _fernet()
    return fernet.encrypt(token.encode()).decode() if fernet else ""


def decrypt_invoice_token(invoice):
    if not invoice.encrypted_access_token:
        return None
    fernet = _fernet()
    if not fernet:
        return None
    try:
        return fernet.decrypt(invoice.encrypted_access_token.encode()).decode()
    except Exception:
        return None


def issue_invoice_token(invoice, *, save=True):
    token = secrets.token_urlsafe(32)
    invoice.access_token_digest = invoice_token_digest(token)
    invoice.encrypted_access_token = _encrypt_token(token)
    invoice.access_token_created_at = timezone.now()
    if save:
        invoice.save(update_fields=(
            "access_token_digest", "encrypted_access_token", "access_token_created_at", "updated_at",
        ))
    return token


def issue_invoice_access_code(invoice, *, revoke_existing=True):
    if revoke_existing:
        InvoiceAccessCode.objects.filter(
            invoice=invoice, used_at__isnull=True, revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())
    code = secrets.token_urlsafe(32)
    InvoiceAccessCode.objects.create(
        invoice=invoice,
        code_digest=invoice_token_digest(code),
        encrypted_delivery_copy=_encrypt_token(code),
        expires_at=timezone.now() + timedelta(hours=12),
    )
    return code


def decrypt_invoice_access_code(access_code):
    if not access_code.encrypted_delivery_copy:
        return None
    fernet = _fernet()
    try:
        return fernet.decrypt(access_code.encrypted_delivery_copy.encode()).decode()
    except Exception:
        return None


def revoke_invoice_access(invoice):
    now = timezone.now()
    CheckoutSession.objects.filter(invoice=invoice, revoked_at__isnull=True).update(revoked_at=now)
    InvoiceAccessCode.objects.filter(invoice=invoice, used_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)


def invoice_resume_url(invoice, token=None):
    path = f"/payment/{invoice.pk}"
    frontend = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    suffix = f"#code={quote(token)}" if token else ""
    return f"{frontend}{path}{suffix}" if frontend else f"{path}{suffix}"


def serialize_invoice_access(invoice, token=None):
    data = {
        "resume_url": invoice_resume_url(invoice, token),
        "email_delivery": {
            "invoice_sent_at": invoice.invoice_email_sent_at,
            "invoice_error": invoice.invoice_email_error,
            "recovery_sent_at": invoice.recovery_email_sent_at,
            "recovery_error": invoice.recovery_email_error,
        },
    }
    return data


def create_checkout_session(invoice):
    CheckoutSession.objects.filter(invoice=invoice, revoked_at__isnull=True).update(revoked_at=timezone.now())
    token = secrets.token_urlsafe(32)
    CheckoutSession.objects.create(
        invoice=invoice,
        token_digest=invoice_token_digest(token),
        expires_at=timezone.now() + timedelta(hours=12),
    )
    return token


@transaction.atomic
def exchange_invoice_code(invoice_id, code, *, request=None):
    invoice = PaymentInvoice.objects.select_for_update(of=("self",)).get(pk=invoice_id)
    if invoice.status not in {PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING, PaymentInvoice.Status.EXPIRED}:
        raise ValidationError({"detail": "This invoice can no longer be opened."})
    submitted_digest = invoice_token_digest(code)
    access_code = InvoiceAccessCode.objects.select_for_update().filter(
        invoice=invoice,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
        code_digest=submitted_digest,
    ).order_by("-created_at").first()
    if not access_code:
        audit_event("checkout_code_rejected", invoice=invoice, request=request)
        raise ValidationError({"detail": "Invoice access is unauthorized."})
    if not access_code.used_at:
        access_code.used_at = timezone.now()
        access_code.encrypted_delivery_copy = ""
        access_code.save(update_fields=("used_at", "encrypted_delivery_copy"))
    invoice.access_token_last_used_at = timezone.now()
    invoice.save(update_fields=("access_token_last_used_at", "updated_at"))
    session_token = create_checkout_session(invoice)
    audit_event("checkout_session_issued", invoice=invoice, request=request)
    return invoice, session_token


def authorize_checkout_session(request, invoice):
    token = request.COOKIES.get(checkout_cookie_name(settings.CHECKOUT_SESSION_COOKIE_NAME), "")
    if not token:
        return False
    session = CheckoutSession.objects.filter(
        invoice=invoice,
        token_digest=invoice_token_digest(token),
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    ).first()
    if not session:
        return False
    session.last_used_at = timezone.now()
    session.save(update_fields=("last_used_at",))
    return True


def queue_invoice_email(invoice_id):
    from .tasks import send_invoice_email

    try:
        cast(Any, send_invoice_email).delay(str(invoice_id))
    except Exception:
        pass


def apply_plan_to_organization(organization, plan, *, activate=True):
    organization.max_admins = plan.max_admins
    organization.max_users = plan.max_users
    organization.max_smtp_accounts = plan.max_smtp_accounts
    organization.daily_email_limit = plan.daily_email_limit
    organization.weekly_email_limit = plan.weekly_email_limit
    organization.monthly_email_limit = plan.email_limit
    organization.max_recipients = plan.max_recipients
    organization.max_campaigns_per_day = plan.max_campaigns_per_day
    update_fields = [
        "max_admins", "max_users", "max_smtp_accounts", "daily_email_limit",
        "weekly_email_limit", "monthly_email_limit", "max_recipients",
        "max_campaigns_per_day", "updated_at",
    ]
    if activate:
        organization.status = Organization.Status.ACTIVE
        update_fields.append("status")
    organization.save(update_fields=update_fields)


@transaction.atomic
def assign_plan_to_organization(organization, plan, *, activate_organization=False):
    apply_plan_to_organization(organization, plan, activate=activate_organization)
    now = timezone.now()
    subscription, created = Subscription.objects.get_or_create(
        organization=organization,
        defaults={
            "plan": plan,
            "status": Subscription.Status.ACTIVE,
            "current_period_start": now,
            "current_period_end": now + timedelta(days=30),
        },
    )
    if not created:
        subscription_obj = cast(Any, subscription)
        needs_new_period = (
            subscription_obj.plan_id != plan.id
            or subscription_obj.status != Subscription.Status.ACTIVE
            or subscription_obj.current_period_end <= now
        )
        subscription_obj.plan = plan
        subscription_obj.status = Subscription.Status.ACTIVE
        if needs_new_period:
            subscription_obj.current_period_start = now
            subscription_obj.current_period_end = now + timedelta(days=30)
        subscription_obj.save()
    return subscription


def _unique_username(email):
    base = email.split("@", 1)[0][:120] or "admin"
    value, counter = base, 1
    while User.objects.filter(username=value).exists():
        suffix = str(counter)
        value = f"{base[:150-len(suffix)]}{suffix}"
        counter += 1
    return value


def _create_customer(invoice_or_data, plan):
    email = invoice_or_data.customer_email if hasattr(invoice_or_data, "customer_email") else invoice_or_data["email"]
    name = invoice_or_data.customer_name if hasattr(invoice_or_data, "customer_name") else invoice_or_data["name"]
    org_name = invoice_or_data.organization_name if hasattr(invoice_or_data, "organization_name") else invoice_or_data["organization_name"]
    password_hash = invoice_or_data.password_hash if hasattr(invoice_or_data, "password_hash") else invoice_or_data["password_hash"]
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError({"email": "An account already exists with this email."})
    organization = Organization.objects.create(name=org_name)
    apply_plan_to_organization(organization, plan)
    user = User(
        username=_unique_username(email), email=email, name=name, first_name=name,
        role=cast(Any, User).Role.ADMIN, organization=organization, password=password_hash,
    )
    user.save()
    organization.created_by = user
    organization.save(update_fields=("created_by", "updated_at"))
    now = timezone.now()
    Subscription.objects.create(
        organization=organization, plan=plan, status=Subscription.Status.ACTIVE,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    )
    return organization, user


@transaction.atomic
def provision_free_account(data, request):
    verify_turnstile(data.get("turnstile_token", ""), request)
    ip_digest = private_hash(client_ip(request))
    email_digest = private_hash(data["email"])
    if FreePlanClaim.objects.filter(ip_hash=ip_digest).exists():
        raise ValidationError({"detail": "A free account has already been created from this IP address."})
    if FreePlanClaim.objects.filter(email_hash=email_digest).exists():
        raise ValidationError({"detail": "This email has already claimed a free account."})
    
    plan = None
    plan_slug = (data.get("plan_slug") or "").strip()
    if plan_slug:
        plan = Plan.objects.select_for_update().filter(slug=plan_slug, is_free=True, is_active=True).first()
    if not plan:
        plan = Plan.objects.select_for_update().filter(is_free=True, is_active=True).order_by("display_order").first()
    if not plan:
        raise ValidationError({"detail": "No active free plan is currently available."})

    organization, user = _create_customer(data, plan)
    try:
        FreePlanClaim.objects.create(ip_hash=ip_digest, email_hash=email_digest, organization=organization)
    except IntegrityError as exc:
        raise ValidationError({"detail": "This free-plan claim has already been used."}) from exc
    return organization, user


def _quoted_amount(price_bdt, invoice_id, rate):
    rate = Decimal(rate)
    if rate <= 0:
        raise ValidationError({"detail": "USDT conversion rate is not configured."})
    base = (Decimal(price_bdt) / rate).quantize(Decimal("0.001"), rounding=ROUND_UP)
    # A sub-0.10 USDT suffix binds a public transfer to one active invoice.
    suffix = Decimal((invoice_id.int % 99_999) + 1) / Decimal(1_000_000)
    return (base + suffix).quantize(Decimal("0.000001")), rate


@transaction.atomic
def create_invoice(validated_data):
    idempotency_key = (validated_data.pop("idempotency_key", "") or "").strip()[:96]
    customer_email = normalized_email(validated_data["customer_email"])
    org_key = normalized_org_name(validated_data["organization_name"])
    if idempotency_key:
        existing = PaymentInvoice.objects.select_for_update().filter(
            normalized_customer_email=customer_email,
            idempotency_key=idempotency_key,
            status__in=ACTIVE_INVOICE_STATUSES + (PaymentInvoice.Status.EXPIRED,),
        ).order_by("-created_at").first()
        if existing:
            return existing, create_checkout_session(existing), False
    active = PaymentInvoice.objects.select_for_update().filter(
        models.Q(normalized_customer_email=customer_email) | models.Q(normalized_organization_name=org_key),
        status__in=ACTIVE_INVOICE_STATUSES,
        expires_at__gt=timezone.now(),
    ).order_by("-created_at").first()
    if active:
        from .tasks import send_recovery_email

        try:
            cast(Any, send_recovery_email).delay(customer_email)
        except Exception:
            pass
        raise InvoiceConflict("A pending invoice already exists for this email. We sent a secure recovery link if it can still be used.")
    plan = Plan.objects.select_for_update().get(slug=validated_data.pop("plan_slug"), is_active=True, is_free=False)
    network = validated_data["network"]
    billing_config = get_runtime_billing_configuration()
    validated_data["customer_email"] = customer_email
    validated_data["normalized_customer_email"] = customer_email
    validated_data["normalized_organization_name"] = org_key
    invoice = PaymentInvoice(plan=plan, price_bdt=plan.price_bdt, expires_at=timezone.now() + timedelta(minutes=settings.PAYMENT_QUOTE_MINUTES), **validated_data)
    invoice.idempotency_key = idempotency_key
    invoice.receiving_address = {
        "bsc": billing_config.payment_evm_wallet,
        "ethereum": billing_config.payment_evm_wallet,
        "tron": billing_config.payment_tron_wallet,
        "ton": billing_config.payment_ton_wallet,
    }[network]
    invoice.token_contract = {
        "bsc": settings.USDT_BSC_CONTRACT,
        "ethereum": settings.USDT_ETH_CONTRACT,
        "tron": settings.USDT_TRON_CONTRACT,
        "ton": settings.USDT_TON_MASTER,
    }[network]
    invoice.token_decimals = DECIMALS_BY_NETWORK[network]
    invoice.snapshot_limits = {
        "email_limit": plan.email_limit,
        "daily_email_limit": plan.daily_email_limit,
        "weekly_email_limit": plan.weekly_email_limit,
        "max_admins": plan.max_admins,
        "max_users": plan.max_users,
        "max_smtp_accounts": plan.max_smtp_accounts,
        "max_recipients": plan.max_recipients,
        "max_campaigns_per_day": plan.max_campaigns_per_day,
    }
    for _ in range(20):
        invoice.id = uuid.uuid4()
        invoice.amount_usdt, invoice.usdt_bdt_rate = _quoted_amount(
            plan.price_bdt, invoice.id, billing_config.usdt_bdt_rate,
        )
        invoice.amount_raw = amount_to_raw(invoice.amount_usdt, invoice.token_decimals)
        if not PaymentInvoice.objects.filter(
            network=network, amount_usdt=invoice.amount_usdt,
            status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING),
            expires_at__gt=timezone.now(),
        ).exists():
            break
    else:
        raise ValidationError({"detail": "Could not allocate a unique payment amount. Please try again."})
    try:
        invoice.save()
    except IntegrityError as exc:
        raise InvoiceConflict("A pending invoice already exists for this email or checkout request.") from exc
    session_token = create_checkout_session(invoice)
    audit_event("invoice_created", invoice=invoice, metadata={"network": network, "plan": plan.slug})
    transaction.on_commit(lambda: queue_invoice_email(invoice.pk))
    return invoice, session_token, True


@transaction.atomic
def replace_invoice(invoice, password_hash):
    if invoice.status == PaymentInvoice.Status.PAID:
        raise ValidationError({"detail": "This invoice has already been paid."})
    if invoice.status in {PaymentInvoice.Status.CANCELLED, PaymentInvoice.Status.REPLACED}:
        raise ValidationError({"detail": "This invoice is no longer active."})
    data = {
        "plan_slug": invoice.plan.slug,
        "network": invoice.network,
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "organization_name": invoice.organization_name,
        "password_hash": password_hash,
        "idempotency_key": f"replace:{invoice.pk}:{uuid.uuid4()}",
    }
    invoice.status = PaymentInvoice.Status.REPLACED
    invoice.replaced_at = timezone.now()
    invoice.save(update_fields=("status", "replaced_at", "updated_at"))
    revoke_invoice_access(invoice)
    new_invoice, token, _ = create_invoice(data)
    invoice.password_hash = ""
    invoice.replaced_by = new_invoice
    invoice.save(update_fields=("password_hash", "replaced_by", "updated_at"))
    return new_invoice, token


@transaction.atomic
def cancel_invoice(invoice):
    if invoice.status == PaymentInvoice.Status.PAID:
        raise ValidationError({"detail": "Paid invoices cannot be cancelled."})
    if invoice.status in {PaymentInvoice.Status.CANCELLED, PaymentInvoice.Status.REPLACED}:
        return invoice
    invoice.status = PaymentInvoice.Status.CANCELLED
    invoice.password_hash = ""
    invoice.cancelled_at = timezone.now()
    invoice.save(update_fields=("status", "password_hash", "cancelled_at", "updated_at"))
    revoke_invoice_access(invoice)
    audit_event("invoice_cancelled", invoice=invoice)
    return invoice


def _ledger_payload(invoice, transfer):
    raw = transfer.raw or {}
    return {
        "network": invoice.network,
        "transaction_hash": transfer.transaction_hash,
        "transfer_index": transfer.transfer_index,
        "canonical_contract": raw.get("contract") or invoice.token_contract,
        "destination": raw.get("destination") or invoice.receiving_address,
        "amount_raw": getattr(transfer, "amount_raw", None) or amount_to_raw(transfer.amount, invoice.token_decimals),
        "amount_usdt": transfer.amount,
        "block_reference": transfer.block_reference or "",
        "confirmations": transfer.confirmations,
        "occurred_at": transfer.occurred_at,
        "provider_proofs": raw,
        "invoice": invoice,
    }


def record_review_claim(invoice, transfer, reason):
    try:
        ledger, _ = PaymentTransferLedger.objects.get_or_create(
            network=invoice.network,
            transaction_hash=transfer.transaction_hash,
            transfer_index=transfer.transfer_index,
            defaults={**_ledger_payload(invoice, transfer), "resolution_history": [{"status": "review", "reason": reason, "at": timezone.now().isoformat()}]},
        )
    except IntegrityError:
        ledger = PaymentTransferLedger.objects.get(
            network=invoice.network,
            transaction_hash=transfer.transaction_hash,
            transfer_index=transfer.transfer_index,
        )
    audit_event("payment_review_claim", invoice=invoice, ledger=ledger, metadata={"reason": reason})
    return ledger


@transaction.atomic
def resolve_manual_transfer(ledger_id, action, *, actor, notes="", refund_transaction_hash=""):
    ledger = PaymentTransferLedger.objects.select_for_update(of=("self",)).select_related("invoice", "invoice__plan", "invoice__organization").get(pk=ledger_id)
    invoice = ledger.invoice
    if not invoice:
        raise ValidationError({"detail": "This transfer is not bound to an invoice."})
    if ledger.resolution != PaymentTransferLedger.Resolution.UNRESOLVED:
        raise ValidationError({"detail": "This transfer has already been resolved."})
    if action == "approve":
        if invoice.status != PaymentInvoice.Status.MANUAL_REVIEW:
            raise ValidationError({"detail": "Only manual-review invoices can be approved."})
        ledger.resolution = PaymentTransferLedger.Resolution.MANUAL_APPROVED
        invoice = fulfill_paid_invoice(invoice.pk, type("Transfer", (), {
            "transaction_hash": ledger.transaction_hash,
            "transfer_index": ledger.transfer_index,
            "amount": ledger.amount_usdt,
            "amount_raw": ledger.amount_raw,
            "block_reference": ledger.block_reference,
            "confirmations": ledger.confirmations,
            "occurred_at": ledger.occurred_at,
            "raw": ledger.provider_proofs,
        })())
    elif action == "reject":
        ledger.resolution = PaymentTransferLedger.Resolution.MANUAL_REJECTED
        invoice.status = PaymentInvoice.Status.REJECTED
        invoice.verification_error = notes or "Payment claim rejected after owner review."
        invoice.password_hash = ""
        invoice.save(update_fields=("status", "verification_error", "password_hash", "updated_at"))
    elif action == "refund":
        if not refund_transaction_hash:
            raise ValidationError({"refund_transaction_hash": "Record the outbound refund transaction hash."})
        ledger.resolution = PaymentTransferLedger.Resolution.MANUAL_REFUNDED
        ledger.refund_transaction_hash = refund_transaction_hash
        invoice.status = PaymentInvoice.Status.REJECTED
        invoice.verification_error = notes or "Payment was marked refunded by owner review."
        invoice.password_hash = ""
        invoice.save(update_fields=("status", "verification_error", "password_hash", "updated_at"))
    else:
        raise ValidationError({"action": "Choose approve, reject, or refund."})
    ledger.notes = notes
    ledger.resolution_history = [
        *ledger.resolution_history,
        {"status": ledger.resolution, "actor": getattr(actor, "email", ""), "notes": notes, "at": timezone.now().isoformat()},
    ]
    ledger.save(update_fields=("resolution", "refund_transaction_hash", "notes", "resolution_history", "updated_at"))
    audit_event(f"manual_transfer_{action}", invoice=invoice, ledger=ledger, actor=actor, metadata={"notes": notes})
    return ledger


@transaction.atomic
def fulfill_paid_invoice(invoice_id, transfer):
    invoice = PaymentInvoice.objects.select_for_update(of=("self",)).select_related("plan", "organization").get(pk=invoice_id)
    if invoice.status == PaymentInvoice.Status.PAID:
        return invoice
    if invoice.status not in {PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING}:
        raise ValidationError({"detail": "This invoice can no longer be fulfilled."})
    if amount_to_raw(transfer.amount, invoice.token_decimals) != invoice.amount_raw:
        record_review_claim(invoice, transfer, "amount_mismatch")
        invoice.status = PaymentInvoice.Status.MANUAL_REVIEW
        invoice.transaction_hash = transfer.transaction_hash
        invoice.transfer_index = transfer.transfer_index
        invoice.verification_data = transfer.raw
        invoice.verification_error = "Payment amount does not exactly match this invoice."
        invoice.password_hash = ""
        invoice.save(update_fields=("status", "transaction_hash", "transfer_index", "verification_data", "verification_error", "password_hash", "updated_at"))
        return invoice
    try:
        ledger, created = PaymentTransferLedger.objects.get_or_create(
            network=invoice.network,
            transaction_hash=transfer.transaction_hash,
            transfer_index=transfer.transfer_index,
            defaults={
                **_ledger_payload(invoice, transfer),
                "resolution": PaymentTransferLedger.Resolution.AUTO_ACTIVATED,
                "resolution_history": [{"status": "auto_activated", "invoice": str(invoice.pk), "at": timezone.now().isoformat()}],
            },
        )
        if not created and ledger.resolution != PaymentTransferLedger.Resolution.UNRESOLVED:
            raise IntegrityError("transfer already resolved")
        if not created:
            ledger.invoice = invoice
            ledger.resolution = PaymentTransferLedger.Resolution.AUTO_ACTIVATED
            ledger.resolution_history = [
                *ledger.resolution_history,
                {"status": "auto_activated", "invoice": str(invoice.pk), "at": timezone.now().isoformat()},
            ]
            ledger.save(update_fields=("invoice", "resolution", "resolution_history", "updated_at"))
    except IntegrityError as exc:
        raise ValidationError({"detail": "This blockchain transfer has already been used."})
    invoice_obj = cast(Any, invoice)
    if invoice_obj.organization_id:
        organization = invoice_obj.organization
        apply_plan_to_organization(organization, invoice_obj.plan)
        now = timezone.now()
        subscription, created = Subscription.objects.get_or_create(
            organization=organization,
            defaults={
                "plan": invoice_obj.plan, "status": Subscription.Status.ACTIVE,
                "current_period_start": now, "current_period_end": now + timedelta(days=30),
            },
        )
        subscription_obj = cast(Any, subscription)
        same_active_plan = not created and (
            subscription_obj.plan_id == invoice_obj.plan_id
            and subscription_obj.status == Subscription.Status.ACTIVE
            and subscription_obj.current_period_end > now
        )
        if not created:
            if same_active_plan:
                subscription_obj.current_period_end += timedelta(days=30)
            else:
                subscription_obj.plan = invoice_obj.plan
                subscription_obj.current_period_start = now
                subscription_obj.current_period_end = now + timedelta(days=30)
            subscription_obj.status = Subscription.Status.ACTIVE
            subscription_obj.save()
    else:
        organization, _ = _create_customer(invoice, invoice_obj.plan)
        invoice_obj.organization = organization
    invoice.transaction_hash = transfer.transaction_hash
    invoice.transfer_index = transfer.transfer_index
    invoice.verification_data = transfer.raw
    invoice.verification_error = ""
    invoice.password_hash = ""
    invoice.status = PaymentInvoice.Status.PAID
    invoice.verified_at = timezone.now()
    invoice.save()
    revoke_invoice_access(invoice)
    audit_event("invoice_auto_activated", invoice=invoice, ledger=ledger)
    from .tasks import send_payment_confirmation_email

    transaction.on_commit(lambda: cast(Any, send_payment_confirmation_email).delay(str(invoice.pk)))
    return invoice
### This iss nothing
