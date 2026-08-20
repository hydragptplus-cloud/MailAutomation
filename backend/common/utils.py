from django.conf import settings
from django.utils import timezone


def utcnow():
    return timezone.now()


def get_client_ip(request):
    if not request:
        return "unknown"
    if getattr(settings, "TRUST_X_FORWARDED_FOR", False):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                num_proxies = getattr(settings, "NUM_PROXIES", 1)
                if len(parts) >= num_proxies:
                    return parts[-num_proxies]
                return parts[0]
    return request.META.get("REMOTE_ADDR") or "unknown"

