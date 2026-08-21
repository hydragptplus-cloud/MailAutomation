from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from common.permissions import OwnerOnly

from .models import PlatformBroadcast, PlatformBroadcastDelivery
from .serializers import PlatformBroadcastDeliverySerializer, PlatformBroadcastSerializer
from .services import preview_count
from .tasks import launch_platform_broadcast


class PlatformBroadcastViewSet(viewsets.ModelViewSet):
    throttle_scope = None
    queryset = PlatformBroadcast.objects.select_related("created_by").all()
    serializer_class = PlatformBroadcastSerializer
    permission_classes = [OwnerOnly]
    search_fields = ("subject", "body")
    filterset_fields = ("status",)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="platform_broadcast")
    def preview(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"count": preview_count(serializer.validated_data)})

    @action(detail=True, methods=["post"], throttle_classes=[ScopedRateThrottle], throttle_scope="platform_broadcast")
    def launch(self, request, pk=None):
        with transaction.atomic():
            broadcast = PlatformBroadcast.objects.select_for_update().get(pk=self.get_object().pk)
            if broadcast.status != PlatformBroadcast.Status.DRAFT:
                return Response({"detail": "Only draft broadcasts can be launched."}, status=status.HTTP_400_BAD_REQUEST)
            count = preview_count({}, broadcast)
            if count <= 0:
                return Response({"detail": "No users match this broadcast target."}, status=status.HTTP_400_BAD_REQUEST)
            broadcast.status = PlatformBroadcast.Status.QUEUED
            broadcast.total_count = count
            broadcast.queued_at = timezone.now()
            broadcast.save(update_fields=("status", "total_count", "queued_at", "updated_at"))
            transaction.on_commit(lambda: launch_platform_broadcast.delay(broadcast.pk))
        return Response(self.get_serializer(broadcast).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        broadcast = self.get_object()
        if broadcast.status not in {PlatformBroadcast.Status.DRAFT, PlatformBroadcast.Status.QUEUED, PlatformBroadcast.Status.SENDING}:
            return Response({"detail": "This broadcast can no longer be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        broadcast.status = PlatformBroadcast.Status.CANCELLED
        broadcast.finished_at = timezone.now()
        broadcast.save(update_fields=("status", "finished_at", "updated_at"))
        broadcast.deliveries.filter(
            status__in=(PlatformBroadcastDelivery.Status.PENDING, PlatformBroadcastDelivery.Status.SENDING)
        ).update(status=PlatformBroadcastDelivery.Status.SKIPPED, message="Broadcast was cancelled.")
        return Response(self.get_serializer(broadcast).data)

    @action(detail=True, methods=["get"])
    def deliveries(self, request, pk=None):
        broadcast = self.get_object()
        qs = broadcast.deliveries.all()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = PlatformBroadcastDeliverySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(PlatformBroadcastDeliverySerializer(qs, many=True).data)
