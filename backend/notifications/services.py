from .models import Notification


def create_broadcast_notifications(broadcast, users):
    notifications = [
        Notification(
            user=user,
            type=Notification.Type.BROADCAST,
            title=broadcast.subject,
            body=broadcast.body,
            related_broadcast=broadcast,
        )
        for user in users
    ]
    if notifications:
        Notification.objects.bulk_create(notifications, ignore_conflicts=True)
