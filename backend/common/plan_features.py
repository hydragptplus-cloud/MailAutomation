SUPPORT_WORKSPACE_PLAN_SLUGS = {"premium-plus", "custom"}
SUPPORT_WORKSPACE_PLAN_NAMES = {"premium+", "premium plus", "custom"}


def organization_plan(organization):
    try:
        subscription = organization.subscription
    except Exception:
        return None
    if getattr(subscription, "status", "") != "active":
        return None
    return subscription.plan


def organization_has_support_workspace_plan(organization):
    plan = organization_plan(organization)
    if not plan:
        return False
    slug = (plan.slug or "").strip().lower()
    name = (plan.name or "").strip().lower()
    return slug in SUPPORT_WORKSPACE_PLAN_SLUGS or name in SUPPORT_WORKSPACE_PLAN_NAMES


def organization_support_workspace_allowed(organization):
    return bool(
        organization
        and organization.support_workspace_enabled
        and organization_has_support_workspace_plan(organization)
    )


def organization_mailbox_usage(organization):
    from support.models import SupportMailbox

    smtp_count = organization.smtp_accounts.count()
    inbox_count = SupportMailbox.objects.filter(organization=organization).count()
    return {
        "smtp_count": smtp_count,
        "inbox_count": inbox_count,
        "used": smtp_count + inbox_count,
        "limit": organization.max_smtp_accounts,
    }
