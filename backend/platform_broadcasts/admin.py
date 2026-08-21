from django.contrib import admin

from .models import PlatformBroadcast, PlatformBroadcastDelivery


@admin.register(PlatformBroadcast)
class PlatformBroadcastAdmin(admin.ModelAdmin):
    list_display = ("subject", "status", "total_count", "sent_count", "failed_count", "created_at")
    list_filter = ("status", "active_only", "created_at")
    search_fields = ("subject", "body")


@admin.register(PlatformBroadcastDelivery)
class PlatformBroadcastDeliveryAdmin(admin.ModelAdmin):
    list_display = ("broadcast", "recipient_email", "status", "attempts", "sent_at")
    list_filter = ("status", "created_at")
    search_fields = ("recipient_email", "recipient_name", "message")
