from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, UserLoginSession

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = list(UserAdmin.fieldsets or []) + [("Mail Flow", {"fields": ("name", "role", "organization")})]
    list_display = ("username", "email", "name", "role", "organization", "is_active")


@admin.register(UserLoginSession)
class UserLoginSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "session_id", "ip_address", "created_at", "last_seen_at", "revoked_at")
    readonly_fields = ("session_id", "refresh_token_jti", "created_at", "last_seen_at")
