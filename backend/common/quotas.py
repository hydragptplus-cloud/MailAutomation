from datetime import timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Organization, OrganizationUsage


MESSAGES = {
    "inactive": "Account is suspended or its subscription has expired. Contact support.",
    "daily": "Daily email quota exceeded.",
    "weekly": "Weekly email quota exceeded.",
    "monthly": "Monthly email quota exceeded.",
    "campaigns": "Daily campaign limit reached for this account.",
}


def _subscription_window(organization, now):
    try:
        subscription = organization.subscription
    except (AttributeError, ObjectDoesNotExist):
        return None
    if subscription.current_period_end <= now and subscription.plan.is_free:
        elapsed = now - subscription.current_period_end
        periods = (elapsed.days // 30) + 1
        subscription.current_period_start += timedelta(days=30 * periods)
        subscription.current_period_end += timedelta(days=30 * periods)
        subscription.status = subscription.Status.ACTIVE
        subscription.save(update_fields=("current_period_start", "current_period_end", "status", "updated_at"))
    return subscription


def usage_snapshot(organization, on_date=None):
    now = timezone.now()
    on_date = on_date or timezone.localdate()
    subscription = _subscription_window(organization, now)
    if subscription:
        period_start = timezone.localtime(subscription.current_period_start).date()
        period_end = timezone.localtime(subscription.current_period_end).date()
    else:
        period_start = on_date.replace(day=1)
        period_end = None

    daily = OrganizationUsage.objects.filter(organization=organization, date=on_date).first()
    period_qs = OrganizationUsage.objects.filter(organization=organization, date__gte=period_start)
    if period_end:
        period_qs = period_qs.filter(date__lte=period_end)
    period = period_qs.aggregate(sent=Sum("emails_sent"), failed=Sum("emails_failed"), campaigns=Sum("campaigns_launched"))

    week_number = max((on_date - period_start).days // 7, 0)
    week_start = period_start + timedelta(days=week_number * 7)
    week_end = min(week_start + timedelta(days=6), period_end) if period_end else week_start + timedelta(days=6)
    weekly_sent = OrganizationUsage.objects.filter(
        organization=organization, date__gte=week_start, date__lte=week_end
    ).aggregate(sent=Sum("emails_sent"))["sent"] or 0

    daily_sent = daily.emails_sent if daily else 0
    period_sent = period["sent"] or 0
    daily_remaining = None if organization.daily_email_limit == 0 else max(organization.daily_email_limit - daily_sent, 0)
    weekly_remaining = None if organization.weekly_email_limit == 0 else max(organization.weekly_email_limit - weekly_sent, 0)
    return {
        "date": on_date,
        "period_start": period_start,
        "period_end": period_end,
        "daily_sent": daily_sent,
        "daily_remaining": daily_remaining,
        "weekly_sent": weekly_sent,
        "weekly_remaining": weekly_remaining,
        "week_start": week_start,
        "week_end": week_end,
        "monthly_sent": period_sent,
        "monthly_remaining": max(organization.monthly_email_limit - period_sent, 0),
        "campaigns_today": daily.campaigns_launched if daily else 0,
        "campaigns_remaining": max(organization.max_campaigns_per_day - (daily.campaigns_launched if daily else 0), 0),
        "emails_failed_today": daily.emails_failed if daily else 0,
    }


def validate_organization_active(organization):
    subscription = _subscription_window(organization, timezone.now())
    if organization.status != Organization.Status.ACTIVE:
        raise ValidationError({"detail": MESSAGES["inactive"]})
    if subscription and (subscription.status != subscription.Status.ACTIVE or subscription.current_period_end <= timezone.now()):
        raise ValidationError({"detail": MESSAGES["inactive"]})


def validate_email_quota(organization, requested):
    validate_organization_active(organization)
    usage = usage_snapshot(organization)
    if usage["daily_remaining"] is not None and requested > usage["daily_remaining"]:
        raise ValidationError({"detail": MESSAGES["daily"]})
    if usage["weekly_remaining"] is not None and requested > usage["weekly_remaining"]:
        raise ValidationError({"detail": MESSAGES["weekly"]})
    if requested > usage["monthly_remaining"]:
        raise ValidationError({"detail": MESSAGES["monthly"]})
    return usage


@transaction.atomic
def record_campaign_launch(organization_id):
    organization = Organization.objects.select_for_update().get(pk=organization_id)
    validate_organization_active(organization)
    usage, _ = OrganizationUsage.objects.select_for_update().get_or_create(
        organization=organization, date=timezone.localdate()
    )
    if usage.campaigns_launched >= organization.max_campaigns_per_day:
        raise ValidationError({"detail": MESSAGES["campaigns"]})
    usage.campaigns_launched += 1
    usage.save(update_fields=["campaigns_launched"])


@transaction.atomic
def record_email_result(organization_id, *, sent):
    usage, _ = OrganizationUsage.objects.select_for_update().get_or_create(
        organization_id=organization_id, date=timezone.localdate()
    )
    field = "emails_sent" if sent else "emails_failed"
    setattr(usage, field, getattr(usage, field) + 1)
    usage.save(update_fields=[field])
