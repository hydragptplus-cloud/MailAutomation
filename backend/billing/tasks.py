from typing import Any

from celery import shared_task
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .emails import (
    build_html_shell,
    deliver_account_created_email,
    deliver_checkout_otp_email,
    deliver_invoice_email,
    deliver_manual_review_email,
    deliver_payment_confirmation_email,
    deliver_renewal_reminder_email,
    format_datetime,
    format_limit,
    invoice_link,
    limits_text,
    send_system_email,
)
from .models import BillingReminderDelivery, PaymentInvoice, Subscription

User = get_user_model()

# Aliases for backwards compatibility with any existing internal references
_send_message = send_system_email
_html_shell = build_html_shell
_format_datetime = format_datetime
_format_limit = format_limit
_limits_text = limits_text
_invoice_link = invoice_link
_deliver_invoice_email = deliver_invoice_email
_deliver_renewal_reminder = deliver_renewal_reminder_email

EMAIL_TASK_OPTIONS = {
    "autoretry_for": (Exception,),
    "retry_backoff": True,
    "retry_backoff_max": 300,
    "retry_jitter": True,
    "max_retries": 5,
}


def _record_delivery(invoice_id: int, sent_field: str, error_field: str, *, error: str = "") -> None:
    values: dict[str, Any] = {error_field: error[:4000]}
    if not error:
        values[sent_field] = timezone.now()
    PaymentInvoice.objects.filter(pk=invoice_id).update(**values)


@shared_task(**EMAIL_TASK_OPTIONS)
def send_checkout_otp_email(email: str, code: str) -> str:
    deliver_checkout_otp_email(email, code)
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_invoice_email(invoice_id: int) -> str:
    invoice = PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)
    try:
        deliver_invoice_email(invoice)
    except Exception:
        _record_delivery(invoice.pk, "invoice_email_sent_at", "invoice_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "invoice_email_sent_at", "invoice_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_recovery_email(email: str) -> str:
    invoice = (
        PaymentInvoice.objects.select_related("plan")
        .filter(
            customer_email__iexact=email.strip(),
            status__in=(PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING),
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    if not invoice:
        return "no_active_invoice"
    try:
        deliver_invoice_email(invoice, recovery=True)
    except Exception:
        _record_delivery(invoice.pk, "recovery_email_sent_at", "recovery_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "recovery_email_sent_at", "recovery_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_payment_confirmation_email(invoice_id: int) -> str:
    invoice = PaymentInvoice.objects.select_related("plan", "organization").get(pk=invoice_id)
    if invoice.status != PaymentInvoice.Status.PAID:
        return "not_paid"
    try:
        deliver_payment_confirmation_email(invoice)
    except Exception:
        _record_delivery(invoice.pk, "confirmation_email_sent_at", "confirmation_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "confirmation_email_sent_at", "confirmation_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_manual_review_email(invoice_id: int) -> str:
    invoice = PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)
    try:
        deliver_manual_review_email(invoice)
    except Exception:
        _record_delivery(invoice.pk, "manual_review_email_sent_at", "manual_review_email_error", error="Email delivery failed.")
        raise RuntimeError("Email delivery failed.") from None
    _record_delivery(invoice.pk, "manual_review_email_sent_at", "manual_review_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_account_created_email(user_id: int) -> str:
    user = (
        User.objects.select_related(
            "organization",
            "organization__subscription",
            "organization__subscription__plan",
        )
        .get(pk=user_id)
    )
    if not user.organization:
        return "no_organization"
    deliver_account_created_email(user)
    return "sent"


@shared_task
def expire_payment_invoices() -> int:
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


@shared_task
def send_upcoming_renewal_reminders() -> dict[str, int]:
    now = timezone.now()
    window_end = now + timezone.timedelta(days=7)

    subscriptions = (
        Subscription.objects.select_related("plan", "organization")
        .filter(
            status=Subscription.Status.ACTIVE,
            plan__is_free=False,
            current_period_end__gt=now,
            current_period_end__lte=window_end,
        )
    )

    sent_count = 0
    failed_count = 0
    skipped_count = 0

    for subscription in subscriptions:
        admins = (
            User.objects.filter(
                organization=subscription.organization,
                is_active=True,
                role=User.Role.ADMIN,
            )
            .exclude(email__isnull=True)
            .exclude(email__exact="")
        )

        seen_emails: set[str] = set()
        for admin_user in admins:
            email = admin_user.email.strip()
            if not email or email.lower() in seen_emails:
                continue
            seen_emails.add(email.lower())

            with transaction.atomic():
                delivery, _ = BillingReminderDelivery.objects.select_for_update().get_or_create(
                    subscription=subscription,
                    recipient_email=email,
                    renewal_date=subscription.current_period_end,
                )
                if delivery.sent_at is not None:
                    skipped_count += 1
                    continue
                delivery.attempt_count += 1
                delivery.save(update_fields=["attempt_count", "updated_at"])

            try:
                deliver_renewal_reminder_email(delivery, admin_name=admin_user.name or admin_user.username)
            except Exception as exc:
                failed_count += 1
                sanitized_error = str(exc)[:4000]
                delivery.last_error = sanitized_error
                delivery.save(update_fields=["last_error", "updated_at"])
            else:
                sent_count += 1
                delivery.sent_at = timezone.now()
                delivery.last_error = ""
                delivery.save(update_fields=["sent_at", "last_error", "updated_at"])

    return {
        "processed": sent_count + failed_count + skipped_count,
        "sent": sent_count,
        "failed": failed_count,
        "skipped": skipped_count,
    }
