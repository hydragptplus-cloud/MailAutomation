from .models import Recipient

def bulk_update_status(ids, status):
    return Recipient.objects.filter(id__in=ids).update(status=status)

def bulk_delete(ids):
    deleted, _ = Recipient.objects.filter(id__in=ids).delete()
    return deleted
