from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from django.utils.html import escape

from .models import PlatformBroadcast

User = get_user_model()


VALID_ROLES = {"owner", "admin", "manager", "operator", "viewer"}
VALID_ORGANIZATION_STATUSES = {"active", "suspended", "expired"}


def normalize_list(value):
    if not value:
        return []
    if not isinstance(value, list):
        return []
    return [str(item).strip().lower() for item in value if str(item).strip()]


def target_user_queryset(broadcast: PlatformBroadcast) -> QuerySet:
    qs = User.objects.select_related("organization", "organization__subscription", "organization__subscription__plan")
    qs = qs.exclude(email="")
    if broadcast.active_only:
        qs = qs.filter(is_active=True)
    roles = normalize_list(broadcast.target_roles)
    if roles:
        qs = qs.filter(role__in=roles)
    plan_slugs = normalize_list(broadcast.target_plan_slugs)
    if plan_slugs:
        qs = qs.filter(organization__subscription__plan__slug__in=plan_slugs)
    organization_statuses = normalize_list(broadcast.target_organization_statuses)
    if organization_statuses:
        qs = qs.filter(organization__status__in=organization_statuses)
    return qs.order_by("id")


def preview_count(attrs: dict[str, Any], instance: PlatformBroadcast | None = None) -> int:
    broadcast = instance or PlatformBroadcast(subject=attrs.get("subject", "Preview"), body=attrs.get("body", "Preview"))
    for field in ("target_roles", "target_plan_slugs", "target_organization_statuses", "active_only"):
        if field in attrs:
            setattr(broadcast, field, attrs[field])
    return target_user_queryset(broadcast).count()


def render_broadcast_html(subject: str, body: str) -> str:
    paragraphs = "".join(
        f"<p style=\"font-size:15px;line-height:1.6;color:#34424f;margin:0 0 14px\">{escape(part)}</p>"
        for part in body.splitlines()
        if part.strip()
    )
    if not paragraphs:
        paragraphs = "<p style=\"font-size:15px;line-height:1.6;color:#34424f;margin:0\">Mail Flow update.</p>"
    return (
        "<div style=\"font-family:Arial,sans-serif;background:#f6f8fb;padding:28px\">"
        "<div style=\"max-width:620px;margin:0 auto;background:#fff;border:1px solid #dde4ec;"
        "border-radius:8px;padding:28px\">"
        f"<h1 style=\"font-size:22px;margin:0 0 16px;color:#17212b\">{escape(subject)}</h1>"
        f"{paragraphs}"
        "<p style=\"font-size:13px;color:#6b7785;line-height:1.5;margin-top:24px\">Mail Flow</p>"
        "</div></div>"
    )
