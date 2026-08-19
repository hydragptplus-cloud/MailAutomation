from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

from .models import PaymentInvoice, Subscription


EMAIL_TASK_OPTIONS = {
    "autoretry_for": (Exception,),
    "retry_backoff": True,
    "retry_backoff_max": 300,
    "retry_jitter": True,
    "max_retries": 5,
}


def _send_message(subject, body, recipient, html=None):
    reply_to = [settings.MAIL_FLOW_REPLY_TO] if settings.MAIL_FLOW_REPLY_TO else None
    message = EmailMultiAlternatives(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
        reply_to=reply_to,
    )
    if html:
        message.attach_alternative(html, "text/html")
    message.send(fail_silently=False)


def _record_delivery(invoice_id, sent_field, error_field, *, error=""):
    values = {error_field: error[:4000]}
    if not error:
        values[sent_field] = timezone.now()
    PaymentInvoice.objects.filter(pk=invoice_id).update(**values)


def _invoice_link(invoice):
    from .models import InvoiceAccessCode
    from .services import decrypt_invoice_access_code, invoice_resume_url, issue_invoice_access_code, revoke_invoice_access

    if invoice.status not in (PaymentInvoice.Status.PENDING, PaymentInvoice.Status.VERIFYING, PaymentInvoice.Status.EXPIRED):
        return invoice_resume_url(invoice)
    revoke_invoice_access(invoice)
    token = issue_invoice_access_code(invoice)
    access_code = InvoiceAccessCode.objects.filter(invoice=invoice).order_by("-created_at").first()
    token = decrypt_invoice_access_code(access_code) or token
    return invoice_resume_url(invoice, token)


def _deliver_invoice_email(invoice, *, recovery=False):
    link = _invoice_link(invoice)
    purpose = "Resume your USDT payment" if recovery else "Your USDT invoice is ready"
    body = (
        f"Hello {invoice.customer_name},\n\n"
        f"{purpose} for the {invoice.plan.name} plan.\n"
        f"Amount: {invoice.amount_usdt} USDT\n"
        f"Network: {invoice.get_network_display()}\n"
        f"Quote expires: {invoice.expires_at.isoformat()}\n\n"
        f"Secure payment link: {link}\n\n"
        "This link grants access to your invoice. Do not forward it."
    )
    _send_message(f"{purpose} - Mail Flow", body, invoice.customer_email)
    invoice.access_codes.filter(encrypted_delivery_copy__gt="").update(encrypted_delivery_copy="")


@shared_task(**EMAIL_TASK_OPTIONS)
def send_invoice_email(invoice_id):
    invoice = PaymentInvoice.objects.select_related("plan").get(pk=invoice_id)
    try:
        _deliver_invoice_email(invoice)
    except Exception as exc:
        _record_delivery(invoice.pk, "invoice_email_sent_at", "invoice_email_error", error=str(exc))
        raise
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
    except Exception as exc:
        _record_delivery(invoice.pk, "recovery_email_sent_at", "recovery_email_error", error=str(exc))
        raise
    _record_delivery(invoice.pk, "recovery_email_sent_at", "recovery_email_error")
    return "sent"


@shared_task(**EMAIL_TASK_OPTIONS)
def send_payment_confirmation_email(invoice_id):
    invoice = PaymentInvoice.objects.select_related("plan", "organization").get(pk=invoice_id)
    if invoice.status != PaymentInvoice.Status.PAID:
        return "not_paid"
    subscription = Subscription.objects.filter(organization_id=invoice.organization_id).first()
    explorer = {
        "bsc": "https://bscscan.com/tx/",
        "ethereum": "https://etherscan.io/tx/",
        "tron": "https://tronscan.org/#/transaction/",
        "ton": "https://tonviewer.com/transaction/",
    }.get(invoice.network, "")
    body = (
        f"Hello {invoice.customer_name},\n\nPayment confirmed. Your {invoice.plan.name} plan is active.\n"
        f"Amount: {invoice.amount_usdt} USDT\nNetwork: {invoice.get_network_display()}\n"
        f"Transaction: {explorer}{invoice.transaction_hash}\n"
        f"Active until: {subscription.current_period_end.isoformat() if subscription else 'See your dashboard'}\n\n"
        f"Sign in: {settings.FRONTEND_URL.rstrip('/')}/login"
    )
    try:
        _send_message("Payment confirmed - Mail Flow", body, invoice.customer_email)
    except Exception as exc:
        _record_delivery(invoice.pk, "confirmation_email_sent_at", "confirmation_email_error", error=str(exc))
        raise
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
        _send_message("Payment under manual review - Mail Flow", body, invoice.customer_email)
    except Exception as exc:
        _record_delivery(invoice.pk, "manual_review_email_sent_at", "manual_review_email_error", error=str(exc))
        raise
    _record_delivery(invoice.pk, "manual_review_email_sent_at", "manual_review_email_error")
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
