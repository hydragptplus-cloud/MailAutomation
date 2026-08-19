from django.utils import timezone

def utcnow():
    return timezone.now()
