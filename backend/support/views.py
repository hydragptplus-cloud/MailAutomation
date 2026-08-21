from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.plan_features import organization_mailbox_usage, organization_support_workspace_allowed
from common.tenancy import is_owner, scope_queryset
from .models import SupportMailbox, SupportTicket
from .serializers import (
    PublicSupportTicketSerializer,
    SupportMailboxSerializer,
    SupportReplySerializer,
    SupportTicketSerializer,
)
from .services import send_support_reply, sync_mailbox


def workspace_allowed(user):
    if not user or not user.is_authenticated:
        return False
    if user.role == "owner":
        return True
    return bool(user.role == "admin" and organization_support_workspace_allowed(getattr(user, "organization", None)))


class PublicSupportTicketView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "support_message"

    def post(self, request):
        serializer = PublicSupportTicketSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        return Response(
            {
                "detail": "Your message has been sent to Mail Flow support.",
                "ticket_number": ticket.ticket_number,
            },
            status=status.HTTP_201_CREATED,
        )


class SupportWorkspaceAccessView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = getattr(request.user, "organization", None)
        usage = organization_mailbox_usage(organization) if organization else None
        return Response({
            "enabled": workspace_allowed(request.user),
            "role": request.user.role,
            "organization_enabled": bool(getattr(request.user.organization, "support_workspace_enabled", False)),
            "plan_available": True if request.user.role == "owner" else organization_support_workspace_allowed(organization),
            "mail_connection_usage": usage,
        })


class SupportTicketViewSet(viewsets.ModelViewSet):
    serializer_class = SupportTicketSerializer
    permission_classes = [IsAuthenticated]
    queryset = SupportTicket.objects.select_related("organization", "mailbox", "requester", "assigned_to").prefetch_related("messages")
    filterset_fields = ("status", "priority", "organization", "mailbox")
    search_fields = ("ticket_number", "name", "email", "subject", "messages__body")

    def update(self, request, *args, **kwargs):
        if not workspace_allowed(request.user):
            return Response({"detail": "Mail workspace is not enabled."}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not workspace_allowed(request.user):
            return Response({"detail": "Mail workspace is not enabled."}, status=403)
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        queryset = super().get_queryset()
        user = self.request.user
        if workspace_allowed(user):
            return queryset if is_owner(user) else queryset.filter(organization=user.organization)
        return queryset.filter(requester=user)

    def create(self, request, *args, **kwargs):
        serializer = PublicSupportTicketSerializer(
            data={
                "name": request.user.name or request.user.username,
                "email": request.user.email,
                "subject": request.data.get("subject", "Support request"),
                "message": request.data.get("message", ""),
            },
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save()
        return Response(self.get_serializer(ticket).data, status=201)

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        if not workspace_allowed(request.user):
            return Response({"detail": "Mail workspace is not enabled."}, status=403)
        ticket = self.get_object()
        serializer = SupportReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mailbox = serializer.validated_data.get("mailbox")
        if mailbox and not is_owner(request.user) and mailbox.organization_id != request.user.organization_id:
            return Response({"detail": "Mailbox is not available for this organization."}, status=403)
        message = send_support_reply(ticket, serializer.validated_data["body"], actor=request.user, mailbox=mailbox)
        return Response(SupportTicketSerializer(message.ticket).data)

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        if not workspace_allowed(request.user):
            return Response({"detail": "Mail workspace is not enabled."}, status=403)
        ticket = self.get_object()
        next_status = request.data.get("status")
        if next_status not in dict(SupportTicket.Status.choices):
            return Response({"status": "Choose a valid status."}, status=400)
        ticket.status = next_status
        ticket.save(update_fields=("status", "updated_at"))
        return Response(self.get_serializer(ticket).data)


class SupportMailboxViewSet(viewsets.ModelViewSet):
    serializer_class = SupportMailboxSerializer
    permission_classes = [IsAuthenticated]
    queryset = SupportMailbox.objects.select_related("organization", "created_by")
    search_fields = ("name", "email", "imap_host", "smtp_host")

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        if not workspace_allowed(self.request.user):
            return SupportMailbox.objects.none()
        queryset = super().get_queryset()
        return queryset if is_owner(self.request.user) else queryset.filter(organization=self.request.user.organization)

    def create(self, request, *args, **kwargs):
        if not workspace_allowed(request.user):
            return Response({"detail": "Mail workspace is not enabled."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not workspace_allowed(request.user):
            return Response({"detail": "Mail workspace is not enabled."}, status=403)
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def sync(self, request, pk=None):
        mailbox = self.get_object()
        try:
            return Response(sync_mailbox(mailbox))
        except Exception:
            return Response({"detail": mailbox.last_error or "Mailbox sync failed."}, status=400)
