from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from .models import User, UserLoginSession


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = list(UserAdmin.fieldsets or []) + [
        (
            "Mail Flow & Security",
            {
                "fields": (
                    "name",
                    "role",
                    "organization",
                    "two_factor_enabled",
                    "two_factor_secret",
                    "two_factor_backup_codes",
                )
            },
        )
    ]
    list_display = (
        "username",
        "email",
        "name",
        "role",
        "organization",
        "two_factor_enabled",
        "is_active",
    )
    list_filter = ("role", "two_factor_enabled", "is_active", "organization")
    search_fields = ("username", "email", "name")
    actions = ["reset_two_factor"]

    @admin.action(description="Reset 2FA for selected users")
    def reset_two_factor(self, request, queryset):
        count = 0
        for user in queryset:
            if user.role == User.Role.OWNER and user.pk != request.user.pk:
                continue
            user.two_factor_enabled = False
            user.two_factor_secret = ""
            user.two_factor_backup_codes = []
            user.save(update_fields=["two_factor_enabled", "two_factor_secret", "two_factor_backup_codes"])
            count += 1
        self.message_user(
            request,
            f"2FA reset successfully for {count} user(s).",
            messages.SUCCESS,
        )


@admin.register(UserLoginSession)
class UserLoginSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "session_id", "ip_address", "created_at", "last_seen_at", "revoked_at")
    list_filter = ("created_at", "revoked_at")
    search_fields = ("user__username", "user__email", "ip_address", "session_id")
    readonly_fields = ("session_id", "refresh_token_jti", "created_at", "last_seen_at")
