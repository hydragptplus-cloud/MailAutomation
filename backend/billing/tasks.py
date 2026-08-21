import hashlib
import hmac
import hashlib
import json
import time
from typing import Any

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from django.utils import timezone
import requests

from .models import PaymentInvoice, Subscription

User = get_user_model()


EMAIL_TASK_OPTIONS = {
    "autoretry_for": (Exception,),
    "retry_backoff": True,
    "retry_backoff_max": 300,
    "retry_jitter": True,
    "max_retries": 5,
}


def _send_message(subject, body, recipient, html=None, *, sender="billing"):
    relay_url = getattr(settings, "MAIL_FLOW_OTP_RELAY_URL", "")
    relay_secret = getattr(settings, "MAIL_FLOW_OTP_RELAY_SECRET", "")
    sender = sender if sender in {"billing", "general"} else "billing"
    if relay_url and relay_secret:
        timestamp = str(int(time.time()))
        payload = {
            "email": recipient,
            "sender": sender,
            "subject": subject,
            "body": body,
            "timestamp": timestamp,
        }
        if html:
            payload["html"] = html
        signed_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        signature = hmac.new(relay_secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
        response = requests.post(
            relay_url,
            json=payload,
            headers={
                "X-Mail-Flow-Signature": signature,
                "X-Mail-Flow-Timestamp": timestamp,
            },
            timeout=getattr(settings, "MAIL_FLOW_OTP_RELAY_TIMEOUT", 10),
        )
        response.raise_for_status()
        return

    reply_to = [settings.MAIL_FLOW_REPLY_TO] if settings.MAIL_FLOW_REPLY_TO else None
    from_email = settings.DEFAULT_FROM_EMAIL
    if sender == "general":
        from_email = f"{settings.MAIL_FLOW_GENERAL_SENDER_NAME} <{settings.MAIL_FLOW_GENERAL_SENDER_EMAIL}>"
    message = EmailMultiAlternatives(
        subject=subject,
        body=body,
        from_email=from_email,
        to=[recipient],
        reply_to=reply_to,
    )
    if html:
        message.attach_alternative(html, "text/html")
    message.send(fail_silently=False)


def _record_delivery(invoice_id, sent_field, error_field, *, error=""):
    values: dict[str, Any] = {error_field: error[:4000]}
    if not error:
        values[sent_field] = timezone.now()
    PaymentInvoice.objects.filter(pk=invoice_id).update(**values)


@shared_task(**EMAIL_TASK_OPTIONS)
def send_checkout_otp_email(email, code):
    from .services import send_checkout_otp

    send_checkout_otp(email, code)
    return "sent"


def _invoice_link(invoice):
    from .models import InvoiceAccessCode
    from .services import decrypt_invoice_access_code, invoice_resume_url, issue_invoice_access_code

    if invoice.status not in (PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING, PaymentInvoice.Status.EXPIRED):
        return invoice_resume_url(invoice)
    token = issue_invoice_access_code(invoice, revoke_existing=False)
    access_code = InvoiceAccessCode.objects.filter(invoice=invoice).order_by("-created_at").first()
    token = decrypt_invoice_access_code(access_code) or token
    return invoice_resume_url(invoice, token)


def _format_datetime(value):
    if not value:
        return "Not available"
    return timezone.localtime(value).strftime("%d %b %Y, %I:%M %p %Z")


def _format_limit(value):
    return f"{int(value):,}" if value else "Not included"


def _limits_text(plan):
    return (
        f"Included email quota: {_format_limit(plan.email_limit)} per billing period\n"
        f"Daily email limit: {_format_limit(plan.daily_email_limit)}\n"
        f"Weekly email limit: {_format_limit(plan.weekly_email_limit)}\n"
        f"Administrators: {_format_limit(plan.max_admins)}\n"
        f"Users: {_format_limit(plan.max_users)}\n"
        f"SMTP accounts: {_format_limit(plan.max_smtp_accounts)}"
    )


def _html_shell(title, intro, rows, cta_url="", cta_label=""):
    row_html = "".join(
        f"<tr><td style=\"padding:8px 12px;color:#52616b\">{escape(label)}</td>"
        f"<td style=\"padding:8px 12px;font-weight:600;color:#17212b\">{escape(str(value))}</td></tr>"
        for label, value in rows
    )
    cta = ""
    if cta_url and cta_label:
        cta = (
            f"<p style=\"margin:26px 0\"><a href=\"{escape(cta_url)}\" "
            "style=\"background:#1473e6;color:#fff;text-decoration:none;padding:12px 18px;"
            "border-radius:6px;display:inline-block;font-weight:700\">"
            f"{escape(cta_label)}</a></p>"
        )
    return (
        "<div style=\"font-family:Arial,sans-serif;background:#f6f8fb;padding:28px\">"
        "<div style=\"max-width:620px;margin:0 auto;background:#fff;border:1px solid #dde4ec;"
        "border-radius:8px;padding:28px\">"
        f"<h1 style=\"font-size:22px;margin:0 0 12px;color:#17212b\">{escape(title)}</h1>"
        f"<p style=\"font-size:15px;line-height:1.6;color:#34424f\">{escape(intro)}</p>"
        "<table style=\"width:100%;border-collapse:collapse;margin:20px 0;background:#fbfcfe\">"
        f"{row_html}</table>{cta}"
        "<p style=\"font-size:13px;color:#6b7785;line-height:1.5\">Mail Flow</p>"
        "</div></div>"
    )


def _deliver_invoice_email(invoice, *, recovery=False):
    link = _invoice_link(invoice)
    purpose = "Resume your USDT payment" if recovery else "Your USDT invoice is ready"
    network_label = dict(PaymentInvoice.Network.choices).get(invoice.network, invoice.network)
    rows = [
        ("Invoice ID", invoice.pk),
        ("Account", invoice.customer_email),
        ("Organization", invoice.organization_name),
        ("Plan", invoice.plan.name),
        ("Plan price", f"BDT {invoice.price_bdt:,}"),
        ("USDT quote", f"{invoice.amount_usdt} USDT"),
        ("Network", network_label),
        ("Receiving address", invoice.receiving_address),
        ("Quote expires", _format_datetime(invoice.expires_at)),
    ]
    body = (
        f"Hello {invoice.customer_name},\n\n"
        f"{purpose} for Mail Flow.\n\n"
        f"Invoice ID: {invoice.pk}\n"
        f"Organization: {invoice.organization_name}\n"
        f"Plan: {invoice.plan.name}\n"
        f"Plan price: BDT {invoice.price_bdt:,}\n"
        f"Amount: {invoice.amount_usdt} USDT\n"
        f"Network: {network_label}\n"
        f"Receiving address: {invoice.receiving_address}\n"
        f"Quote expires: {_format_datetime(invoice.expires_at)}\n\n"
        f"{_limits_text(invoice.plan)}\n\n"
        f"Secure payment link: {link}\n\n"
        "This billing link grants access to your invoice. Do not forward it."
    )
    html = _html_shell(
        purpose,
        f"Hello {invoice.customer_name}, your Mail Flow billing invoice is ready with the details below.",
        rows,
        link,
        "Open secure invoice",
    )
    _send_message(f"{purpose} - Mail Flow", body, invoice.customer_email, html, sender="billing")
    invoice.access_codes.filter(encrypted_delivery_copy__gt="").update(encrypted_delivery_copy="")


@shared_task(**EMAIL_TASK_OPTIONS)
def send_invoice_email(invoice_id):
    invoice = PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)
    try:
        _deliver_invoice_email(invoice)
    except Exception:
        _record_delivery(invoice.pk, "invoice_email_sent_at", "invoice_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "invoice_email_sent_at", "invoice_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_recovery_email(email):
    invoice = PaymentInvoice.objects.select_related("plan").filter(
        customer_email__iexact=email.strip(),
        status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING),
        expires_at__gt=timezone.now(),
    ).order_by("-created_at").first()
    if not invoice:
        return "no_active_invoice"
    try:
        _deliver_invoice_email(invoice, recovery=True)
    except Exception:
        _record_delivery(invoice.pk, "recovery_email_sent_at", "recovery_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "recovery_email_sent_at", "recovery_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_payment_confirmation_email(invoice_id):
    invoice = PaymentInvoice.objects.select_related("plan", "organization").get(pk=invoice_id)
    if invoice.status != PaymentInvoice.Status.PAID:
        return "not_paid"
    subscription = Subscription.objects.filter(organization=invoice.organization).first()
    explorer = {
        "bsc": "https://bscscan.com/tx/",
        "ethereum": "https://etherscan.io/tx/",
        "tron": "https://tronscan.org/#/transaction/",
        "ton": "https://tonviewer.com/transaction/",
    }.get(invoice.network, "")
    network_labels: dict[str, str] = {
        str(value): str(label) for value, label in PaymentInvoice.Network.choices
    }
    network_label = network_labels.get(str(invoice.network), str(invoice.network))
    body = (
        f"Hello {invoice.customer_name},\n\nPayment confirmed. Your {invoice.plan.name} plan is active.\n"
        f"Amount: {invoice.amount_usdt} USDT\nNetwork: {network_label}\n"
        f"Transaction: {explorer}{invoice.transaction_hash}\n"
        f"Next billing period starts after: {_format_datetime(subscription.current_period_end) if subscription else 'See your dashboard'}\n\n"
        f"Sign in: {settings.FRONTEND_URL.rstrip('/')}/login"
    )
    html = _html_shell(
        "Payment confirmed",
        f"Hello {invoice.customer_name}, your Mail Flow payment has been confirmed.",
        [
            ("Organization", invoice.organization_name),
            ("Plan", invoice.plan.name),
            ("Amount", f"{invoice.amount_usdt} USDT"),
            ("Network", network_label),
            ("Transaction", f"{explorer}{invoice.transaction_hash}"),
            ("Next billing date", _format_datetime(subscription.current_period_end) if subscription else "See your dashboard"),
        ],
        f"{settings.FRONTEND_URL.rstrip('/')}/login",
        "Sign in",
    )
    try:
        _send_message("Payment confirmed - Mail Flow", body, invoice.customer_email, html, sender="billing")
    except Exception:
        _record_delivery(invoice.pk, "confirmation_email_sent_at", "confirmation_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "confirmation_email_sent_at", "confirmation_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_manual_review_email(invoice_id):
    invoice = PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)
    body = (
        f"Hello {invoice.customer_name},\n\nWe found your USDT transfer, but it arrived after the quote expired. "
        "The payment has been placed in manual review. We will contact you after it is resolved.\n\n"
        f"Invoice: {invoice.pk}\nTransaction: {invoice.transaction_hash or 'Recorded'}"
    )
    try:
        _send_message("Payment under manual review - Mail Flow", body, invoice.customer_email, sender="billing")
    except Exception:
        _record_delivery(invoice.pk, "manual_review_email_sent_at", "manual_review_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "manual_review_email_sent_at", "manual_review_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_account_created_email(user_id):
    user = User.objects.select_related("organization", "organization__subscription", "organization__subscription__plan").get(pk=user_id)
    organization = user.organization
    if not organization:
        return "no_organization"
    subscription = getattr(organization, "subscription", None)
    plan = subscription.plan if subscription else None
    login_url = f"{settings.FRONTEND_URL.rstrip('/')}/login"
    period_start = _format_datetime(subscription.current_period_start) if subscription else "Not available"
    period_end = _format_datetime(subscription.current_period_end) if subscription else "Not available"
    plan_name = plan.name if plan else "Not assigned"
    limits = _limits_text(plan) if plan else "Plan limits are not assigned yet."
    body = (
        f"Hello {user.name or user.username},\n\n"
        "Your Mail Flow account has been created.\n\n"
        f"Account email: {user.email}\n"
        f"Organization: {organization.name}\n"
        f"Role: {user.get_role_display()}\n"
        f"Plan: {plan_name}\n"
        f"Billing period: {period_start} to {period_end}\n"
        f"Next billing period: starts after {period_end}\n\n"
        f"{limits}\n\n"
        f"Sign in: {login_url}\n\n"
        "Use the password you set during signup. If an administrator created this account, ask them for your temporary password."
    )
    rows = [
        ("Account email", user.email),
        ("Organization", organization.name),
        ("Role", user.get_role_display()),
        ("Plan", plan_name),
        ("Current billing period", f"{period_start} to {period_end}"),
        ("Next billing period", f"Starts after {period_end}"),
    ]
    html = _html_shell(
        "Your Mail Flow account is ready",
        f"Hello {user.name or user.username}, your Mail Flow account has been created.",
        rows,
        login_url,
        "Sign in",
    )
    _send_message("Your Mail Flow account is ready", body, user.email, html, sender="general")
    return "sent"


@shared_task
def expire_payment_invoices():
    stale = PaymentInvoice.objects.filter(
        status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING),
        expires_at__lte=timezone.now(),
    )
    invoice_ids = list(stale.values_list("pk", flat=True))
    updated = stale.update(status=PaymentInvoice.Status.EXPIRED, password_hash="")
    if invoice_ids:
        from .models import CheckoutSession, InvoiceAccessCode

        now = timezone.now()
        CheckoutSession.objects.filter(invoice_id__in=invoice_ids, revoked_at__isnull=True).update(revoked_at=now)
        InvoiceAccessCode.objects.filter(invoice_id__in=invoice_ids, used_at__isnull=True, revoked_at__isnull=True).update(revoked_at=now)
    return updated
