from django.utils import timezone
from .models import Campaign

def get_due_campaigns():
    return Campaign.objects.filter(status=Campaign.Status.SCHEDULED, scheduled_at__lte=timezone.now())
