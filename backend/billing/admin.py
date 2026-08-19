from django.contrib import admin

from .models import CheckoutSession, FreePlanClaim, InvoiceAccessCode, PaymentInvoice, PaymentSecurityAuditEvent, PaymentTransferLedger, Plan, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = (
        "name", "slug", "price_bdt", "email_limit", "daily_email_limit",
        "weekly_email_limit", "max_admins", "max_users", "max_smtp_accounts",
        "max_recipients", "max_campaigns_per_day", "is_free", "is_active", "display_order",
    )
    list_editable = ("price_bdt", "is_active", "display_order")
    list_filter = ("is_free", "is_active")
    search_fields = ("name", "slug")
    ordering = ("display_order", "price_bdt")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "current_period_end")
    list_filter = ("status", "plan")
    search_fields = ("organization__name",)


@admin.register(PaymentInvoice)
class PaymentInvoiceAdmin(admin.ModelAdmin):
    list_display = ("id", "customer_email", "plan", "network", "amount_usdt", "status", "created_at", "expires_at")
    list_filter = ("status", "network", "plan")
    search_fields = ("id", "customer_email", "organization_name", "transaction_hash")
    readonly_fields = tuple(field.name for field in PaymentInvoice._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return True

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentTransferLedger)
class PaymentTransferLedgerAdmin(admin.ModelAdmin):
    list_display = ("network", "transaction_hash", "transfer_index", "amount_usdt", "resolution", "invoice", "created_at")
    list_filter = ("network", "resolution")
    search_fields = ("transaction_hash", "invoice__customer_email", "refund_transaction_hash")
    readonly_fields = tuple(field.name for field in PaymentTransferLedger._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return True

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CheckoutSession)
class CheckoutSessionAdmin(admin.ModelAdmin):
    list_display = ("invoice", "expires_at", "revoked_at", "created_at", "last_used_at")
    readonly_fields = ("invoice", "token_digest", "expires_at", "revoked_at", "created_at", "last_used_at")


@admin.register(InvoiceAccessCode)
class InvoiceAccessCodeAdmin(admin.ModelAdmin):
    list_display = ("invoice", "expires_at", "used_at", "revoked_at", "created_at")
    readonly_fields = tuple(field.name for field in InvoiceAccessCode._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return True

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentSecurityAuditEvent)
class PaymentSecurityAuditEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "invoice", "ledger", "actor", "created_at")
    list_filter = ("event_type",)
    search_fields = ("invoice__customer_email", "ledger__transaction_hash", "event_type")
    readonly_fields = tuple(field.name for field in PaymentSecurityAuditEvent._meta.fields)


admin.site.register(FreePlanClaim)
