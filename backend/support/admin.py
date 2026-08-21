from django.contrib import admin

from .models import SupportMailbox, SupportMessage, SupportTicket


@admin.register(SupportMailbox)
class SupportMailboxAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "organization", "is_active", "last_synced_at", "updated_at")
    search_fields = ("name", "email", "imap_host", "smtp_host")
    list_filter = ("is_active", "organization")
    readonly_fields = ("encrypted_imap_password", "encrypted_smtp_password")


class SupportMessageInline(admin.TabularInline):
    model = SupportMessage
    extra = 0
    readonly_fields = ("created_at",)


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ("ticket_number", "subject", "email", "organization", "status", "priority", "last_message_at")
    list_filter = ("status", "priority", "source", "organization")
    search_fields = ("ticket_number", "subject", "email", "name")
    inlines = (SupportMessageInline,)
