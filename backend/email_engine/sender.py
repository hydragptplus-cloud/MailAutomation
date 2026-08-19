import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from django.conf import settings  # type: ignore
from django.db import models, transaction  # type: ignore
from django.utils import timezone  # type: ignore
from campaigns.models import CampaignLog
from common.models import Organization
from common.quotas import record_email_result, usage_snapshot, validate_organization_active
from rest_framework.exceptions import ValidationError

def _connection(account):
    context = ssl.create_default_context()

    if account.encryption == "ssl" or account.port == 465:
        server = smtplib.SMTP_SSL(account.host, account.port, timeout=30, context=context)
    else:
        server = smtplib.SMTP(account.host, account.port, timeout=30)
        server.ehlo()
        if account.encryption == "tls":
            server.starttls(context=context)
            server.ehlo()
            
    if account.username and account.get_password():
        server.login(account.username, account.get_password())
    return server

def send_log_email(log_id):
    with transaction.atomic():
        log = CampaignLog.objects.select_for_update(of=("self",)).select_related("campaign__template", "campaign__smtp", "recipient", "organization").get(pk=log_id)
        if log.status == CampaignLog.Status.SENT:
            return {"log_id": log_id, "status": CampaignLog.Status.SENT, "detail": "already sent"}
        
        if log.campaign and log.campaign.status in {"cancelled", "paused", "draft"}:
            log.status = CampaignLog.Status.SKIPPED
            log.message = f"Skipped: Campaign is {log.campaign.status}."
            log.save(update_fields=["status", "message", "updated_at"])
            return {"log_id": log_id, "status": CampaignLog.Status.SKIPPED, "detail": f"Campaign is {log.campaign.status}"}

        if not log.campaign or log.organization_id != log.campaign.organization_id:
            raise RuntimeError("Cross-organization campaign log rejected.")

        organization = Organization.objects.select_for_update().get(pk=log.organization_id)
        try:
            validate_organization_active(organization)
        except ValidationError as exc:
            raise RuntimeError(str(exc.detail.get("detail", exc.detail))) from exc
        usage = usage_snapshot(organization)
        reservations = CampaignLog.objects.filter(
            organization=organization, status=CampaignLog.Status.PROCESSING
        ).exclude(pk=log.pk).count()
        if usage["daily_remaining"] is not None and usage["daily_remaining"] <= reservations:
            raise RuntimeError("Daily email quota exceeded.")
        if usage["weekly_remaining"] is not None and usage["weekly_remaining"] <= reservations:
            raise RuntimeError("Weekly email quota exceeded.")
        if usage["monthly_remaining"] <= reservations:
            raise RuntimeError("Monthly email quota exceeded.")
        if not log.campaign.smtp_id:
            raise RuntimeError("SMTP account is missing.")
        account = type(log.campaign.smtp).objects.select_for_update().get(pk=log.campaign.smtp_id)
        account_sent = account.sent_today if account.sent_date == timezone.localdate() else 0
        smtp_reservations = CampaignLog.objects.filter(
            campaign__smtp=account, status=CampaignLog.Status.PROCESSING
        ).exclude(pk=log.pk).count()
        if account_sent + smtp_reservations >= account.daily_limit:
            raise RuntimeError("SMTP daily sending limit reached.")
        log.status = CampaignLog.Status.PROCESSING
        log.attempts += 1
        log.save(update_fields=["status", "attempts", "updated_at"])

    campaign = log.campaign
    if not campaign:
        raise RuntimeError("Campaign is missing.")

    account = campaign.smtp
    if not account:
        raise RuntimeError("SMTP account is missing.")

    if not account.status:
        raise RuntimeError("SMTP account is disabled.")

    if account.sent_date != timezone.localdate():
        account.sent_today = 0
        account.sent_date = timezone.localdate()
        account.save(update_fields=["sent_today", "sent_date"])
    sent_today = account.sent_today or 0
    daily_limit = account.daily_limit or 0
    if sent_today >= daily_limit:
        raise RuntimeError("SMTP daily sending limit reached.")

    template = campaign.template
    if not template:
        raise RuntimeError("Campaign template is missing.")

    recipient = log.recipient
    context = {
        "name": recipient.name if recipient else "",
        "email": log.recipient_email,
        "company": recipient.company if recipient else "",
    }
    
    subject_template = str(campaign.subject or template.subject or "")
    html_template = str(template.html or "")
    subject = render_personalization(subject_template, context)
    html = render_personalization(html_template, context)

    msg = EmailMessage()
    msg["Subject"] = subject
    from_email = str(account.from_email) if account.from_email else ""
    from_name = str(account.from_name) if account.from_name else None
    msg["From"] = formataddr((from_name, from_email)) if from_name else from_email
    msg["To"] = log.recipient_email
    if account.reply_to:
        msg["Reply-To"] = str(account.reply_to)
    domain = from_email.split("@")[-1] if "@" in from_email else "annomous.com"
    message_id = make_msgid(domain=domain)
    msg["Message-ID"] = message_id
    msg.set_content("This email requires an HTML-capable email client.")
    msg.add_alternative(html, subtype="html")

    server = _connection(account)
    try:
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            try:
                server.close()
            except Exception:
                pass

    now = timezone.now()
    with transaction.atomic():
        CampaignLog.objects.filter(pk=log_id).update(
            status=CampaignLog.Status.SENT,
            sent_time=now,
            provider_message_id=message_id,
            message="Sent successfully.",
        )
        account = type(account).objects.select_for_update().get(pk=account.pk)
        if account.sent_date != timezone.localdate():
            account.sent_today = 0
            account.sent_date = timezone.localdate()
        account.sent_today = (account.sent_today or 0) + 1
        account.save(update_fields=["sent_today", "sent_date"])
        type(campaign).objects.filter(pk=campaign.pk).update(sent_count=models.F("sent_count") + 1)
        record_email_result(log.organization_id, sent=True)
    time.sleep(float(getattr(settings, "EMAIL_SEND_DELAY_SECONDS", 0.0)))
    return {"log_id": log_id, "status": CampaignLog.Status.SENT}

def render_personalization(value, context):
    if not value:
        return ""
    
    # Standardize context keys to lowercase
    ctx = {str(k).strip().lower(): (v if v is not None else "") for k, v in context.items()}
    
    # Match {name}, {{name}}, {Name}, {{Company}}, {COMPANY}, etc.
    pattern = re.compile(r'\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}')
    
    def _replacer(match):
        var_name = match.group(1).strip().lower()
        if var_name in ctx:
            return str(ctx[var_name])
        return match.group(0)
        
    return pattern.sub(_replacer, str(value))
