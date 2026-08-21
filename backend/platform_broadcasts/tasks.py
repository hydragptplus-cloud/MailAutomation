from typing import Any, cast

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from billing.tasks import _send_message

from .models import PlatformBroadcast, PlatformBroadcastDelivery
from .services import render_broadcast_html, target_user_queryset


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_platform_broadcast_delivery(self, delivery_id):
    try:
        delivery = PlatformBroadcastDelivery.objects.select_related("broadcast").get(pk=delivery_id)
    except PlatformBroadcastDelivery.DoesNotExist:
        return {"delivery_id": delivery_id, "status": "not_found"}
    if delivery.status in {PlatformBroadcastDelivery.Status.SENT, PlatformBroadcastDelivery.Status.SKIPPED}:
        return {"delivery_id": delivery_id, "status": delivery.status}
    broadcast = delivery.broadcast
    if broadcast.status == PlatformBroadcast.Status.CANCELLED:
        delivery.status = PlatformBroadcastDelivery.Status.SKIPPED
        delivery.message = "Broadcast was cancelled."
        delivery.save(update_fields=("status", "message", "updated_at"))
        cast(Any, finalize_platform_broadcast).delay(broadcast.pk)
        return {"delivery_id": delivery_id, "status": delivery.status}
    PlatformBroadcastDelivery.objects.filter(pk=delivery.pk).update(
        status=PlatformBroadcastDelivery.Status.SENDING,
        attempts=delivery.attempts + 1,
    )
    try:
        _send_message(
            broadcast.subject,
            broadcast.body,
            delivery.recipient_email,
            render_broadcast_html(broadcast.subject, broadcast.body),
            sender="general",
        )
    except Exception:
        if self.request.retries < self.max_retries:
            PlatformBroadcastDelivery.objects.filter(pk=delivery.pk).update(
                status=PlatformBroadcastDelivery.Status.PENDING,
                message="Email delivery failed.",
            )
            raise self.retry(exc=RuntimeError("Email delivery failed.")) from None
        PlatformBroadcastDelivery.objects.filter(pk=delivery.pk).update(
            status=PlatformBroadcastDelivery.Status.FAILED,
            message="Email delivery failed.",
            attempts=self.request.retries + 1,
        )
        cast(Any, finalize_platform_broadcast).delay(broadcast.pk)
        return {"delivery_id": delivery_id, "status": PlatformBroadcastDelivery.Status.FAILED}
    PlatformBroadcastDelivery.objects.filter(pk=delivery.pk).update(
        status=PlatformBroadcastDelivery.Status.SENT,
        message="Sent successfully.",
        sent_at=timezone.now(),
    )
    cast(Any, finalize_platform_broadcast).delay(broadcast.pk)
    return {"delivery_id": delivery_id, "status": PlatformBroadcastDelivery.Status.SENT}


@shared_task()
def finalize_platform_broadcast(broadcast_id):
    broadcast = cast(Any, PlatformBroadcast.objects.get(pk=broadcast_id))
    sent = broadcast.deliveries.filter(status=PlatformBroadcastDelivery.Status.SENT).count()
    failed = broadcast.deliveries.filter(status=PlatformBroadcastDelivery.Status.FAILED).count()
    skipped = broadcast.deliveries.filter(status=PlatformBroadcastDelivery.Status.SKIPPED).count()
    pending = broadcast.deliveries.filter(
        status__in=(PlatformBroadcastDelivery.Status.PENDING, PlatformBroadcastDelivery.Status.SENDING)
    ).count()
    status = PlatformBroadcast.Status.COMPLETED if pending == 0 and failed == 0 else PlatformBroadcast.Status.FAILED
    if pending > 0:
        status = PlatformBroadcast.Status.SENDING
    PlatformBroadcast.objects.filter(pk=broadcast_id).update(
        status=status,
        sent_count=sent,
        failed_count=failed,
        skipped_count=skipped,
        finished_at=timezone.now() if pending == 0 else None,
    )
    return {"broadcast_id": broadcast_id, "sent": sent, "failed": failed, "skipped": skipped, "pending": pending}


@shared_task()
def launch_platform_broadcast(broadcast_id):
    with transaction.atomic():
        broadcast = cast(Any, PlatformBroadcast.objects.select_for_update().get(pk=broadcast_id))
        if broadcast.status not in {PlatformBroadcast.Status.QUEUED, PlatformBroadcast.Status.DRAFT}:
            return {"detail": f"Broadcast is already {broadcast.status}."}
        users = list(target_user_queryset(broadcast))
        broadcast.status = PlatformBroadcast.Status.SENDING
        broadcast.started_at = timezone.now()
        broadcast.total_count = len(users)
        broadcast.save(update_fields=("status", "started_at", "total_count", "updated_at"))
        deliveries = [
            PlatformBroadcastDelivery(
                broadcast=broadcast,
                user=user,
                recipient_email=user.email,
                recipient_name=user.name or user.username,
            )
            for user in users
        ]
        PlatformBroadcastDelivery.objects.bulk_create(deliveries, ignore_conflicts=True)
        from notifications.services import create_broadcast_notifications

        create_broadcast_notifications(broadcast, users)
        delivery_ids = list(broadcast.deliveries.filter(status=PlatformBroadcastDelivery.Status.PENDING).values_list("id", flat=True))
    for delivery_id in delivery_ids:
        cast(Any, send_platform_broadcast_delivery).delay(delivery_id)
    cast(Any, finalize_platform_broadcast).apply_async(args=[broadcast_id], countdown=30)
    return {"broadcast_id": broadcast_id, "queued": len(delivery_ids)}
